[out:json][timeout:25];
(
  // match any address node with an "addr:*" tag that doesn't have a
  // "coa:place_id" tag
  (node[~"^addr:.*$"~"."](29.952994, -98.162870, 30.628265, -97.367831)
    - node[~"^addr:.*$"~"."]["coa:place_id"](29.952994, -98.162870, 30.628265, -97.367831);)
);
out meta;
