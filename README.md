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

## Make'ing Data

There is a Makefile in this repository for downloading the 2013 Austin building footprints and OSM data and doing some transformations.

### Dependencies

* Make
* curl
* gdal/ogr
* tippecanoe
* PostgreSQL with PostGIS extension
