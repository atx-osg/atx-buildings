# This is a Makefile for automatically downloading and preparing data
#
# note: you will probably want to change these, depending on your database setup
#
PG_HOST := localhost
PG_USER := osm
PG_DATABASE := osm


.PHONY: addresses buildings clean

all: addresses buildings clean

addresses: shp/addresses.shp
buildings: shp/buildings.shp

clean:
	rm -rf shp/*
	rm -rf zip/*


# download zip files
zip/build_p.zip:
	mkdir -p $(dir $@)
	curl 'ftp://ftp.ci.austin.tx.us/GIS-Data/Regional/planimetrics/build_p.zip' -o $@.download
	mv $@.download $@

zip/address_point.zip:
	mkdir -p $(dir $@)
	curl 'ftp://ftp.ci.austin.tx.us/GIS-Data/Regional/address_points/address_point.zip' -o $@.download
	mv $@.download $@


# unzip shapefiles
shp/%.shp:
	rm -rf $(basename $@)
	mkdir -p $(basename $@)
	unzip -d $(basename $@) $<
	for file in $(basename $@)/*; do chmod 644 $$file; mv $$file $(basename $@).$${file##*.}; done
	rmdir $(basename $@)
	touch $@

shp/addresses.shp: zip/address_point.zip
shp/buildings.shp: zip/build_p.zip


# load data into a postgis database
load_db: load_addresses load_buildings

load_%: shp/%.shp
	shp2pgsql -I -s 2277:4326 $< atx_$* | psql --host ${PG_HOST} --user ${PG_USER} ${PG_DATABASE}

load_addresses: shp/addresses.shp
load_buildings: shp/buildings.shp
