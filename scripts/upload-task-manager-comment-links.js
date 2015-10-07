// stream in a set of geojson features with import_url property set and use them
// to create comments with import links on an OSM tasking manager instance

import cheerio from 'cheerio';
import es from 'event-stream';
import extent from 'geojson-extent';
import fs from 'fs';
import JSONStream from 'JSONStream';
import minimist from 'minimist';
import rbush from 'rbush';
import request from 'request';
import turf from 'turf';
// turf.difference was recently added to turf
import difference from 'turf-difference';

const argv = minimist(process.argv.slice(2));
const filepath = argv._[0];
const taskManager = argv['task-manager'];
const projectNumber = argv['project'];
const username = argv['username'];
const password = argv['password'];

const osmOrgSite = 'https://www.openstreetmap.org';


// need to explicitly instantiate a cookie jar since the implied global jar in
// request lib doesn't quite work with the weird domain hopping we need to do
let cookieJar = request.jar();

const taskManagerUrl = `http://${taskManager}`;
const encoded = encodeURIComponent(taskManagerUrl + '/');
const login = `${taskManagerUrl}/login?came_from=${encoded}`;
const projectLink = `${taskManagerUrl}/project/${projectNumber}`;
const tasksUrl = `${projectLink}/tasks.json`;


// spatial index used to match OSM tasking manger tasks to local file match
class Index {
  constructor (joinFeatures) {
    this.tree = rbush(16);
    const loadArrays = joinFeatures.features.map((feature) => {
      return extent(feature).concat({'feature': feature});
    });
    this.tree.load(loadArrays);
  }

  find (feature) {
    let found;
    const bboxMatches = this.tree.search(extent(feature.geometry));
    if (bboxMatches.length === 1) {
      // only one bbox bboxMatch, we can assume this is a valid intersection
      // NOTE: assumption holds only if joinFeatures completely covers targets
      return bboxMatches[0][4].feature;
    }
    // more than one bbox bboxMatch, so loop through until you find one that legit
    // spatially intersects
    for (var i = 0, len = bboxMatches.length; i < len; i++) {
      const bboxMatch = bboxMatches[i];

      let matchFound;
      try {
        matchFound = this.match(feature, bboxMatch[4].feature);
      } catch (e) {
        matchFound = false;
      }

      if(matchFound) {
        console.error("found!");
        return bboxMatch[4].feature;
      }
    }
    console.error("no match found :(");
  }

  match (feature1, feature2) {
    // match if two shapes overlap at least 99%
    const tolerance = .01;

    // use convex hull as a simplification - avoids issues regarding
    // multipolygon interoperability in turf.area and turf.difference functions
    const feature1_hull = turf.convex(turf.explode(feature1));
    const feature2_hull = turf.convex(turf.explode(feature2));

    const union = turf.union(feature1_hull, feature2_hull);
    if (union.geometry.type !== 'Polygon') {
      return false;
    }
    const diff1 = difference(union, feature1_hull);
    const diffsize1 = diff1 ? turf.area(diff1) : 0;
    const diff2 = difference(union, feature2_hull);
    const diffsize2 = diff2 ? turf.area(diff2) : 0;
    return (diffsize1 + diffsize2) <= (turf.area(union) * tolerance);
  }
}


// this goes through the auth dance between tasks app and openstreetmap,
// granting access to the tasking manager app for your account. If all goes
// well, it should call the callback and you'll be able to make requests to the
// task manager app. If it doesn't go well, ¯\_(ツ)_/¯
function authDance(cb) {
  request
    .get(login, {followRedirect: false, jar: cookieJar}, (error, response, body) => {
      request
        .get(response.headers.location, {followRedirect: true}, (error, response, body) => {
          let $ = cheerio.load(body);
          let loginForm = {};
          $('form#login_form input').each((i, rawElement) => {
            let element = $(rawElement);
            const name = element.attr('name');
            loginForm[name] = element.val();
          });
          loginForm['username'] = username;
          loginForm['password'] = password;

          const osmLoginURL = `${osmOrgSite}/login`;

          request.post(osmLoginURL, {jar: cookieJar, followRedirect: true, form: loginForm}, (error, response, body) => {
            request
              .get(response.headers.location, {followRedirect: true, jar: cookieJar}, (error, response, body) => {
                let $ = cheerio.load(body);
                let authorizeForm = {};
                $('form input').each((i, rawElement) => {
                  let element = $(rawElement);
                  const name = element.attr('name');
                  authorizeForm[name] = element.val();
                });

                const authorizeUrl = $('form').attr('action');

                request.post(authorizeUrl, {jar: cookieJar, followRedirect: true, form: authorizeForm}, (error, response, body) => {
                  request
                    .get(response.headers.location, {followRedirect: false, jar: cookieJar}, (error, response, body) => {
                      request
                        .get(response.headers.location, {followRedirect: false, jar: cookieJar}, (error, response, body) => {
                          cb(error, response);
                        });
                    });
                });
              });
          });
        });
    });
}


function getTasks(cb) {
  authDance(() => {
    request
      .get(tasksUrl, {jar: cookieJar}, (error, response, body) => {
        let tasks = JSON.parse(body);
        cb(error, tasks);
      });
  });
}

let count = 0;


getTasks((error, tasks) => {
  let spatialIndex = new Index(tasks);

  fs.createReadStream(filepath)
    .pipe(JSONStream.parse('features.*'))
    .pipe(es.map(function(feature, cb) {
      count++;
      if(0 <=count && count < 10) {
        cb(null, feature);
      } else {
        cb();
      }
    }))
    .pipe(es.map(function(feature, cb) {
      const matched = spatialIndex.find(feature);
      const importURL = feature.properties.import_url;
      const task = matched.id;

      const postCommentURL = `${projectLink}/task/${task}/comment`;
      const commentForm = {
        'comment': `import link: <a href="${importURL}">click here</a>`
      };

      const headers = {
        'X-Requested-With': 'XMLHttpRequest',
      };

      request.post(postCommentURL, {jar: cookieJar, followRedirect: false, headers: headers, form: commentForm}, (error, response, body) => {
        if(error) {
          cb(null, "I AM ERROR.");
        }

        const msg = `comment made: task ${task}! ${body}`;
        cb(null, msg);
      });
    }))
    .pipe(JSONStream.stringify())
    .pipe(process.stdout);
});
