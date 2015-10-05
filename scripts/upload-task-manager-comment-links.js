// stream in a set of geojson features with import_url property set and use them
// to create comments with import links on an OSM tasking manager instance

import cheerio from 'cheerio';
import es from 'event-stream';
import fs from 'fs';
import JSONStream from 'JSONStream';
import minimist from 'minimist';
import request from 'request';

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


// this goes through the auth dance between tasks app and openstreetmap,
// granting access to the tasking manager app for your account. If all goes
// well, it should call the callback and you'll be able to make requests to the
// task manager app.
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

getTasks((error, tasks) => {
  process.stdin
    .pipe(JSONStream.parse())
    .pipe(es.map(function(feature, cb) {
      const import_url = feature.properties.import_url;
      const msg = `link: ${import_url}`;
    }))
    .pipe(JSONStream.stringify())
    .pipe(process.stdout);
});

