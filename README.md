Austin, TX Buildings and addresses import project
=================================================

This repo is a central place to keep code and scripts for our project to import
the building footprint and address point datasets from the City of Austin into
OpenStreetMap.

Our planning and data documentation is at the [OSM wiki
page](https://wiki.openstreetmap.org/wiki/Austin,_TX/Buildings_Import)

All levels of OSM / geo experience are welcome. There's plenty of stuff to do
and we'll have time to learn whatever we need to along the way, so please join
us.


## Getting set up

There is a Makefile in this repository for downloading the 2013 Austin building
footprints and OSM data and doing some transformations.


### Dependencies

* Make
* curl
* gdal/ogr
* nodejs and npm


### OSX

Steps for installing everything on OSX. Assuming homebrew is installed and
configured:

* `brew install gdal`
* `brew install node`
* `npm install`


### Making data

Then `cd` into this dir and run:

- `make` to kick off the process of downloading and extracting data


## Work in progress: Alternatives Welcome

We're still in exploration phase with regard to tools and such. Do you use
something else for automating data workflows? Add it to the repo so we can
compare!
