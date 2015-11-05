Austin, TX Buildings and addresses import project
=================================================

This repository is a central place to keep code and scripts for our project to
import the building footprint and address point datasets from the City of Austin
into OpenStreetMap.

Our planning and import documentation is at the [OSM wiki
page](https://wiki.openstreetmap.org/wiki/Austin,_TX/Buildings_Import)

If you just want to help with the import, see the wiki for details on the import
workflow.This repo and the instructions below are just for setting up and
running the data processing scripts to prepare for the import.


## Getting set up

### Dependencies

First, install these dependencies:

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


## Making data

There is a Makefile in this repository that manages the steps of downloading and
processing the original source data for import into OSM.

To prep all the data, just run `make` from the root directory of this repo.
