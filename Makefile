# This is a Makefile for automatically downloading and preparing data

all: buildings addresses

addresses: shp/addresses.shp
buildings: shp/buildings.shp


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

shp/buildings.shp: zip/build_p.zip
shp/addresses.shp: zip/address_point.zip
