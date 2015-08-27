# This is a Makefile for automatically downloading and preparing data
#
# note: you will probably want to change these, depending on your database setup
#
PG_HOST := localhost
PG_USER := osm
PG_PASSWORD := osm
PG_DATABASE := osm


.PHONY: addresses buildings clean json tiles

all: addresses buildings

addresses: shp/atx-addresses.shp
buildings: shp/atx-buildings.shp json/osm-buildings.json
blockgroups: shp/texas-blockgroups.shp

clean:
	rm -rf gz
	rm -rf json
	rm -rf shp
	rm -rf tiles
	rm -rf zip


# download zip files
zip/building_footprints_2013.zip:
	mkdir -p $(dir $@)
	curl 'https://data.austintexas.gov/api/geospatial/d9te-zi9f?method=export&format=Shapefile' -o $@.download
	mv $@.download $@

zip/address_point.zip:
	mkdir -p $(dir $@)
	curl 'https://data.austintexas.gov/api/geospatial/bpa2-q2tj?method=export&format=Shapefile' -o $@.download
	mv $@.download $@


# unzip shapefiles
shp/%.shp:
	rm -rf $(basename $@)
	mkdir -p $(basename $@)
	unzip -d $(basename $@) $<
	for file in $(basename $@)/*; do chmod 644 $$file; mv $$file $(basename $@).$${file##*.}; done
	rmdir $(basename $@)
	touch $@

shp/atx-addresses.shp: zip/address_point.zip
shp/atx-buildings.shp: zip/building_footprints_2013.zip


# convert to geojohnson
json: json/atx-buildings.json json/addresses.json json/osm-buildings.json

json/addresses.json: shp/atx-addresses.shp
	mkdir -p $(dir $@)
	ogr2ogr -f GeoJSON -dim 2 -t_srs EPSG:4326 $@ $<

json/atx-buildings.json: shp/atx-buildings.shp
	mkdir -p $(dir $@)
	ogr2ogr -f GeoJSON -dim 2 -t_srs EPSG:4326 $@ $<

json/osm-buildings.json: scripts/osm-buildings.ql
	mkdir -p $(dir $@)
	node_modules/query-overpass/cli.js $< > $@


# convert to vector tiles
tiles: tiles/osm-buildings.mbtiles tiles/atx-buildings.mbtiles

tiles/atx-buildings.mbtiles: json/atx-buildings.json
	mkdir -p $(dir $@)
	tippecanoe -y "BUILDING_F" -y "MAX_HEIGHT" -y "ELEVATION" -y "FEATURE" -o $@ $<

tiles/osm-buildings.mbtiles: json/osm-buildings.json
	mkdir -p $(dir $@)
	tippecanoe -o $@ $<


# load data into a postgis database
load_db: load_addresses load_buildings

load_%: shp/%.shp
	shp2pgsql -I -s 2277:4326 $< atx_$* | psql --host ${PG_HOST} --user ${PG_USER} ${PG_DATABASE}

load_addresses: shp/atx-addresses.shp
load_buildings: shp/atx-buildings.shp


# borrowed from https://github.com/mbostock/us-atlas
# Census Block Groups
gz/tl_2012_%_bg.zip:
	mkdir -p $(dir $@)
	curl 'http://www2.census.gov/geo/tiger/TIGER2012/BG/$(notdir $@)' -o $@.download
	mv $@.download $@

shp/texas-blockgroups.shp: gz/tl_2012_48_bg.zip
	rm -rf $(basename $@)
	mkdir -p $(basename $@)
	unzip -d $(basename $@) $<
	for file in $(basename $@)/*; do chmod 644 $$file; mv $$file $(basename $@).$${file##*.}; done
	rmdir $(basename $@)
	touch $@
