Austin, TX Buildings and addresses import project
=================================================

This repo is a central place to keep code and scripts for our project to import
the building footprint and address point datasets from the City of Austin into
OpenStreetMap.

Our planning and import documentation is at the [OSM wiki
page](https://wiki.openstreetmap.org/wiki/Austin,_TX/Buildings_Import)

If you just want to work on importing data, see the wiki for info on how that
works. This repo and the instructions below are just for setting up and
running the data processing scripts to prepare for the import. 


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
