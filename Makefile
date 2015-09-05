# This is a Makefile for automatically downloading and preparing data

BABEL := node_modules/babel/bin/babel-node.js


.PHONY: addresses buildings clean json tiles blockgroup-%
.SECONDARY:

all: blockgroups

addresses: shp/atx-addresses.shp
buildings: shp/atx-buildings.shp json/osm-buildings.json
json: json/coa-buildings.json json/coa-addresses.json json/osm-buildings.json json/blockgroups


clean:
	rm -rf gz
	rm -rf json
	rm -rf shp
	rm -rf tiles
	rm -rf zip


# download zip files from CoA
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

shp/coa-addresses.shp: zip/address_point.zip
shp/coa-buildings.shp: zip/building_footprints_2013.zip

# add a way of generating shapefile of coa datasets with census block GEOID for
# visualization purposes
shp/coa-buildings-with-geoid.shp: json/coa-buildings-with-geoid-collected.json
	ogr2ogr -f "ESRI Shapefile" -dim 2 -t_srs EPSG:4326 $@ $<

shp/coa-addresses-with-geoid.shp: json/coa-addresses-with-geoid-collected.json
	ogr2ogr -f "ESRI Shapefile" -dim 2 -t_srs EPSG:4326 $@ $<

# convert block groups to GeoJSON, transform to WGS84, and clip to Austin bbox
json/atx-blockgroups.json: shp/texas-blockgroups.shp
	mkdir -p $(dir $@)
	ogr2ogr -f "GeoJSON" -clipdst -98.2 29.9 -97.3 30.7 -t_srs EPSG:4326 $@ $<

# convert CoA shapefiles to geojohnson
json/coa-buildings.json: shp/coa-buildings.shp
	mkdir -p $(dir $@)
	ogr2ogr -f GeoJSON -dim 2 -t_srs EPSG:4326 $@ $<

json/coa-addresses.json: shp/coa-addresses.shp
	mkdir -p $(dir $@)
	ogr2ogr -f GeoJSON -dim 2 -t_srs EPSG:4326 $@ $<

# add census block group id (GEOID) to each CoA feature
json/coa-%-with-geoid.json: json/atx-blockgroups.json json/coa-%.json
	mkdir -p $(dir $@)
	cat $(word 2, $^) | \
		$(BABEL) scripts/uncollect-features.js | \
		$(BABEL) scripts/spatial-join.js --property GEOID --join $< > $@

# collect GEOID'd buildings into a FeatureCollection
json/coa-%-with-geoid-collected.json: json/coa-%-with-geoid.json
	mkdir -p $(dir $@)
	echo '{"type": "FeatureCollection", "features": [' > $@
	cat $< | \
		sed 's/$$/,/' >> $@
	sed -i '' '$$ s/.$$//' $@
	echo '\n]}' >> $@

# write out the census blockgroup poly to a file
json/blockgroups/%-blockgroup.json: json/atx-blockgroups.json
	mkdir -p $(dir $@)
	cat $< | \
		$(BABEL) scripts/uncollect-features.js | \
		grep '"GEOID":"$(word 1, $(subst -, , $(notdir $@)))' > $@

# process the blockgroup buildings for OSM
json/blockgroups/%-buildings.json: json/blockgroups/%-buildings-raw.json
	mkdir -p $(dir $@)
	cat $< | \
		$(BABEL) scripts/match-properties.js '{"FEATURE": "Structure"}' | \
		$(BABEL) scripts/add-properties.js '{"building": "yes"}' | \
		$(BABEL) scripts/height-conversions.js | \
		$(BABEL) scripts/pick-properties.js '["height", "building"]' | \
		$(BABEL) scripts/simplify-geometries.js --tolerance 0.0000015 | \
		$(BABEL) scripts/collect-features.js > $@

# process the blockgroup addresses for OSM
json/blockgroups/%-addresses.json: json/blockgroups/%-addresses-raw.json
	mkdir -p $(dir $@)
	cat $< | \
		$(BABEL) scripts/match-properties.js '{"ADDRESS_TY": 1}' | \
		$(BABEL) scripts/add-properties.js '{"addr:country": "US", "addr:state": "TX"}' | \
		$(BABEL) scripts/convert-addresses.js | \
		$(BABEL) scripts/pick-properties.js '["addr:country", "addr:state", "addr:street", "addr:housenumber"]' | \
		$(BABEL) scripts/collect-features.js > $@

# download OSM streets for a blockgroup
json/blockgroups/%-streets.json: json/blockgroups/%-blockgroup.json
	mkdir -p $(dir $@)
	ogrinfo -al $< | \
		grep Extent | \
		sed 's/) - (/ /' | \
		sed 's/[(),]/ /g' | \
		awk '{print "\"",$$3,",",$$2,",",$$5,",",$$4,"\""}' | \
		xargs $(BABEL) scripts/get-osm-features.js --type highway --bbox > $@

# write out all the raw CoA building features that are in a blockgroup
json/blockgroups/%-buildings-raw.json: json/coa-buildings-with-geoid.json
	mkdir -p $(dir $@)
	grep '"GEOID":"$(word 1, $(subst -, , $(notdir $@)))"' $< > $@

# write out all the raw CoA address points that are in a blockgroup
json/blockgroups/%-addresses-raw.json: json/coa-addresses-with-geoid.json
	mkdir -p $(dir $@)
	grep '"GEOID":"$(word 1, $(subst -, , $(notdir $@)))"' $< > $@

# download osm buildings via overpass API
json/osm-buildings.json: scripts/osm-buildings.ql
	mkdir -p $(dir $@)
	node_modules/query-overpass/cli.js $< > $@

# convert to processed features to OSM XML
xml/%.xml: json/blockgroups/%.json
	mkdir -p $(dir $@)
	cat $< | \
		$(BABEL) scripts/geojson-to-osm.js > $@


# this part taken from https://github.com/mbostock/us-atlas
# download Census Block Groups
gz/tl_2012_%_bg.zip:
	mkdir -p $(dir $@)
	curl 'http://www2.census.gov/geo/tiger/TIGER2012/BG/$(notdir $@)' -o $@.download
	mv $@.download $@

# unzip Census Block Groups
shp/texas-blockgroups.shp: gz/tl_2012_48_bg.zip
	rm -rf $(basename $@)
	mkdir -p $(basename $@)
	unzip -d $(basename $@) $<
	for file in $(basename $@)/*; do chmod 644 $$file; mv $$file $(basename $@).$${file##*.}; done
	rmdir $(basename $@)
	touch $@


# define all the relevant blockgroups
blockgroup-%: \
		json/blockgroups/%-addresses.json \
		json/blockgroups/%-blockgroup.json \
		json/blockgroups/%-buildings.json \
		json/blockgroups/%-streets.json \
		xml/%-buildings.xml \
		xml/%-addresses.xml
	true


blockgroups: \
	blockgroup-480219501001 \
	blockgroup-480219501002 \
	blockgroup-480219501003 \
	blockgroup-480219502001 \
	blockgroup-480219502002 \
	blockgroup-480219502003 \
	blockgroup-480219502005 \
	blockgroup-480219503001 \
	blockgroup-480219503002 \
	blockgroup-480219508011 \
	blockgroup-480219508012 \
	blockgroup-480219508013 \
	blockgroup-480219508021 \
	blockgroup-480539608003 \
	blockgroup-480559601011 \
	blockgroup-480559601012 \
	blockgroup-482090108051 \
	blockgroup-482090108052 \
	blockgroup-482090108053 \
	blockgroup-482090108054 \
	blockgroup-482090108061 \
	blockgroup-482090108062 \
	blockgroup-482090108071 \
	blockgroup-482090108081 \
	blockgroup-482090108082 \
	blockgroup-482090108083 \
	blockgroup-482090108091 \
	blockgroup-482090108092 \
	blockgroup-482090109011 \
	blockgroup-482090109012 \
	blockgroup-482090109013 \
	blockgroup-482090109014 \
	blockgroup-482090109021 \
	blockgroup-482090109022 \
	blockgroup-482090109023 \
	blockgroup-482090109024 \
	blockgroup-482090109025 \
	blockgroup-482090109051 \
	blockgroup-482090109052 \
	blockgroup-482090109053 \
	blockgroup-482090109061 \
	blockgroup-482090109062 \
	blockgroup-482090109063 \
	blockgroup-482090109064 \
	blockgroup-482090109071 \
	blockgroup-482090109072 \
	blockgroup-482090109073 \
	blockgroup-482090109074 \
	blockgroup-482090109081 \
	blockgroup-482090109082 \
	blockgroup-482090109091 \
	blockgroup-482090109092 \
	blockgroup-482090109093 \
	blockgroup-482090109101 \
	blockgroup-482090109102 \
	blockgroup-482090109103 \
	blockgroup-482090109104 \
	blockgroup-484530001011 \
	blockgroup-484530001012 \
	blockgroup-484530001013 \
	blockgroup-484530001021 \
	blockgroup-484530001022 \
	blockgroup-484530002031 \
	blockgroup-484530002041 \
	blockgroup-484530002042 \
	blockgroup-484530002043 \
	blockgroup-484530002051 \
	blockgroup-484530002052 \
	blockgroup-484530002053 \
	blockgroup-484530002061 \
	blockgroup-484530002062 \
	blockgroup-484530002063 \
	blockgroup-484530003021 \
	blockgroup-484530003022 \
	blockgroup-484530003023 \
	blockgroup-484530003024 \
	blockgroup-484530003025 \
	blockgroup-484530003041 \
	blockgroup-484530003042 \
	blockgroup-484530003051 \
	blockgroup-484530003052 \
	blockgroup-484530003053 \
	blockgroup-484530003061 \
	blockgroup-484530003071 \
	blockgroup-484530004011 \
	blockgroup-484530004012 \
	blockgroup-484530004021 \
	blockgroup-484530004022 \
	blockgroup-484530004023 \
	blockgroup-484530005001 \
	blockgroup-484530005002 \
	blockgroup-484530005003 \
	blockgroup-484530005004 \
	blockgroup-484530006011 \
	blockgroup-484530006012 \
	blockgroup-484530006031 \
	blockgroup-484530006032 \
	blockgroup-484530006033 \
	blockgroup-484530006034 \
	blockgroup-484530006035 \
	blockgroup-484530006041 \
	blockgroup-484530006042 \
	blockgroup-484530006043 \
	blockgroup-484530007001 \
	blockgroup-484530008011 \
	blockgroup-484530008021 \
	blockgroup-484530008022 \
	blockgroup-484530008023 \
	blockgroup-484530008031 \
	blockgroup-484530008032 \
	blockgroup-484530008033 \
	blockgroup-484530008041 \
	blockgroup-484530008042 \
	blockgroup-484530009011 \
	blockgroup-484530009012 \
	blockgroup-484530009021 \
	blockgroup-484530009022 \
	blockgroup-484530009023 \
	blockgroup-484530009024 \
	blockgroup-484530010001 \
	blockgroup-484530010002 \
	blockgroup-484530010003 \
	blockgroup-484530010004 \
	blockgroup-484530010005 \
	blockgroup-484530011001 \
	blockgroup-484530011002 \
	blockgroup-484530012001 \
	blockgroup-484530012002 \
	blockgroup-484530012003 \
	blockgroup-484530013031 \
	blockgroup-484530013032 \
	blockgroup-484530013033 \
	blockgroup-484530013041 \
	blockgroup-484530013042 \
	blockgroup-484530013043 \
	blockgroup-484530013044 \
	blockgroup-484530013051 \
	blockgroup-484530013052 \
	blockgroup-484530013053 \
	blockgroup-484530013054 \
	blockgroup-484530013071 \
	blockgroup-484530013072 \
	blockgroup-484530013073 \
	blockgroup-484530013081 \
	blockgroup-484530013082 \
	blockgroup-484530013083 \
	blockgroup-484530013084 \
	blockgroup-484530014011 \
	blockgroup-484530014012 \
	blockgroup-484530014021 \
	blockgroup-484530014022 \
	blockgroup-484530014023 \
	blockgroup-484530014031 \
	blockgroup-484530014032 \
	blockgroup-484530015011 \
	blockgroup-484530015012 \
	blockgroup-484530015013 \
	blockgroup-484530015014 \
	blockgroup-484530015031 \
	blockgroup-484530015032 \
	blockgroup-484530015033 \
	blockgroup-484530015034 \
	blockgroup-484530015041 \
	blockgroup-484530015042 \
	blockgroup-484530015043 \
	blockgroup-484530015044 \
	blockgroup-484530015051 \
	blockgroup-484530015052 \
	blockgroup-484530015053 \
	blockgroup-484530015054 \
	blockgroup-484530016021 \
	blockgroup-484530016022 \
	blockgroup-484530016023 \
	blockgroup-484530016031 \
	blockgroup-484530016032 \
	blockgroup-484530016033 \
	blockgroup-484530016034 \
	blockgroup-484530016035 \
	blockgroup-484530016041 \
	blockgroup-484530016042 \
	blockgroup-484530016043 \
	blockgroup-484530016044 \
	blockgroup-484530016051 \
	blockgroup-484530016052 \
	blockgroup-484530016053 \
	blockgroup-484530016054 \
	blockgroup-484530016061 \
	blockgroup-484530017051 \
	blockgroup-484530017052 \
	blockgroup-484530017053 \
	blockgroup-484530017054 \
	blockgroup-484530017061 \
	blockgroup-484530017062 \
	blockgroup-484530017063 \
	blockgroup-484530017071 \
	blockgroup-484530017072 \
	blockgroup-484530017073 \
	blockgroup-484530017121 \
	blockgroup-484530017122 \
	blockgroup-484530017123 \
	blockgroup-484530017131 \
	blockgroup-484530017132 \
	blockgroup-484530017133 \
	blockgroup-484530017141 \
	blockgroup-484530017142 \
	blockgroup-484530017143 \
	blockgroup-484530017161 \
	blockgroup-484530017162 \
	blockgroup-484530017181 \
	blockgroup-484530017182 \
	blockgroup-484530017183 \
	blockgroup-484530017184 \
	blockgroup-484530017191 \
	blockgroup-484530017192 \
	blockgroup-484530017193 \
	blockgroup-484530017221 \
	blockgroup-484530017222 \
	blockgroup-484530017223 \
	blockgroup-484530017281 \
	blockgroup-484530017282 \
	blockgroup-484530017283 \
	blockgroup-484530017284 \
	blockgroup-484530017285 \
	blockgroup-484530017291 \
	blockgroup-484530017292 \
	blockgroup-484530017293 \
	blockgroup-484530017331 \
	blockgroup-484530017332 \
	blockgroup-484530017371 \
	blockgroup-484530017372 \
	blockgroup-484530017373 \
	blockgroup-484530017381 \
	blockgroup-484530017382 \
	blockgroup-484530017383 \
	blockgroup-484530017384 \
	blockgroup-484530017385 \
	blockgroup-484530017401 \
	blockgroup-484530017402 \
	blockgroup-484530017411 \
	blockgroup-484530017412 \
	blockgroup-484530017421 \
	blockgroup-484530017422 \
	blockgroup-484530017451 \
	blockgroup-484530017452 \
	blockgroup-484530017461 \
	blockgroup-484530017462 \
	blockgroup-484530017471 \
	blockgroup-484530017472 \
	blockgroup-484530017473 \
	blockgroup-484530017481 \
	blockgroup-484530017482 \
	blockgroup-484530017491 \
	blockgroup-484530017492 \
	blockgroup-484530017493 \
	blockgroup-484530017494 \
	blockgroup-484530017501 \
	blockgroup-484530017502 \
	blockgroup-484530017503 \
	blockgroup-484530017511 \
	blockgroup-484530017512 \
	blockgroup-484530017521 \
	blockgroup-484530017522 \
	blockgroup-484530017523 \
	blockgroup-484530017531 \
	blockgroup-484530017541 \
	blockgroup-484530017542 \
	blockgroup-484530017543 \
	blockgroup-484530017551 \
	blockgroup-484530017552 \
	blockgroup-484530017561 \
	blockgroup-484530017562 \
	blockgroup-484530017571 \
	blockgroup-484530017572 \
	blockgroup-484530017601 \
	blockgroup-484530017602 \
	blockgroup-484530017611 \
	blockgroup-484530017612 \
	blockgroup-484530017641 \
	blockgroup-484530017642 \
	blockgroup-484530017651 \
	blockgroup-484530017652 \
	blockgroup-484530017661 \
	blockgroup-484530017662 \
	blockgroup-484530017663 \
	blockgroup-484530017681 \
	blockgroup-484530017682 \
	blockgroup-484530017691 \
	blockgroup-484530017692 \
	blockgroup-484530017701 \
	blockgroup-484530017702 \
	blockgroup-484530017703 \
	blockgroup-484530017711 \
	blockgroup-484530017712 \
	blockgroup-484530017721 \
	blockgroup-484530017722 \
	blockgroup-484530017731 \
	blockgroup-484530017732 \
	blockgroup-484530017733 \
	blockgroup-484530017741 \
	blockgroup-484530017742 \
	blockgroup-484530017743 \
	blockgroup-484530017751 \
	blockgroup-484530017752 \
	blockgroup-484530017761 \
	blockgroup-484530017762 \
	blockgroup-484530017771 \
	blockgroup-484530017772 \
	blockgroup-484530017781 \
	blockgroup-484530017782 \
	blockgroup-484530017791 \
	blockgroup-484530017792 \
	blockgroup-484530017793 \
	blockgroup-484530017801 \
	blockgroup-484530017802 \
	blockgroup-484530017811 \
	blockgroup-484530017812 \
	blockgroup-484530017821 \
	blockgroup-484530017822 \
	blockgroup-484530017823 \
	blockgroup-484530017831 \
	blockgroup-484530017832 \
	blockgroup-484530017841 \
	blockgroup-484530017842 \
	blockgroup-484530017851 \
	blockgroup-484530017852 \
	blockgroup-484530017861 \
	blockgroup-484530017862 \
	blockgroup-484530017863 \
	blockgroup-484530017864 \
	blockgroup-484530018041 \
	blockgroup-484530018042 \
	blockgroup-484530018043 \
	blockgroup-484530018051 \
	blockgroup-484530018052 \
	blockgroup-484530018061 \
	blockgroup-484530018062 \
	blockgroup-484530018063 \
	blockgroup-484530018064 \
	blockgroup-484530018111 \
	blockgroup-484530018112 \
	blockgroup-484530018121 \
	blockgroup-484530018122 \
	blockgroup-484530018123 \
	blockgroup-484530018131 \
	blockgroup-484530018132 \
	blockgroup-484530018171 \
	blockgroup-484530018172 \
	blockgroup-484530018173 \
	blockgroup-484530018181 \
	blockgroup-484530018182 \
	blockgroup-484530018183 \
	blockgroup-484530018191 \
	blockgroup-484530018192 \
	blockgroup-484530018201 \
	blockgroup-484530018202 \
	blockgroup-484530018203 \
	blockgroup-484530018211 \
	blockgroup-484530018212 \
	blockgroup-484530018213 \
	blockgroup-484530018221 \
	blockgroup-484530018222 \
	blockgroup-484530018223 \
	blockgroup-484530018224 \
	blockgroup-484530018231 \
	blockgroup-484530018232 \
	blockgroup-484530018233 \
	blockgroup-484530018241 \
	blockgroup-484530018242 \
	blockgroup-484530018261 \
	blockgroup-484530018262 \
	blockgroup-484530018281 \
	blockgroup-484530018282 \
	blockgroup-484530018283 \
	blockgroup-484530018291 \
	blockgroup-484530018292 \
	blockgroup-484530018321 \
	blockgroup-484530018322 \
	blockgroup-484530018331 \
	blockgroup-484530018332 \
	blockgroup-484530018333 \
	blockgroup-484530018334 \
	blockgroup-484530018341 \
	blockgroup-484530018342 \
	blockgroup-484530018351 \
	blockgroup-484530018352 \
	blockgroup-484530018353 \
	blockgroup-484530018391 \
	blockgroup-484530018392 \
	blockgroup-484530018401 \
	blockgroup-484530018402 \
	blockgroup-484530018403 \
	blockgroup-484530018411 \
	blockgroup-484530018412 \
	blockgroup-484530018413 \
	blockgroup-484530018414 \
	blockgroup-484530018421 \
	blockgroup-484530018422 \
	blockgroup-484530018431 \
	blockgroup-484530018432 \
	blockgroup-484530018441 \
	blockgroup-484530018442 \
	blockgroup-484530018443 \
	blockgroup-484530018451 \
	blockgroup-484530018452 \
	blockgroup-484530018461 \
	blockgroup-484530018462 \
	blockgroup-484530018471 \
	blockgroup-484530018472 \
	blockgroup-484530018481 \
	blockgroup-484530018482 \
	blockgroup-484530018483 \
	blockgroup-484530018491 \
	blockgroup-484530018492 \
	blockgroup-484530018493 \
	blockgroup-484530018494 \
	blockgroup-484530018501 \
	blockgroup-484530018502 \
	blockgroup-484530018503 \
	blockgroup-484530018511 \
	blockgroup-484530018512 \
	blockgroup-484530018513 \
	blockgroup-484530018514 \
	blockgroup-484530018531 \
	blockgroup-484530018532 \
	blockgroup-484530018541 \
	blockgroup-484530018542 \
	blockgroup-484530018543 \
	blockgroup-484530018551 \
	blockgroup-484530018552 \
	blockgroup-484530018553 \
	blockgroup-484530018554 \
	blockgroup-484530018555 \
	blockgroup-484530018561 \
	blockgroup-484530018562 \
	blockgroup-484530018571 \
	blockgroup-484530018572 \
	blockgroup-484530018581 \
	blockgroup-484530018582 \
	blockgroup-484530018583 \
	blockgroup-484530018584 \
	blockgroup-484530018585 \
	blockgroup-484530018591 \
	blockgroup-484530018592 \
	blockgroup-484530018601 \
	blockgroup-484530018602 \
	blockgroup-484530018611 \
	blockgroup-484530018612 \
	blockgroup-484530018621 \
	blockgroup-484530018622 \
	blockgroup-484530018631 \
	blockgroup-484530018632 \
	blockgroup-484530018641 \
	blockgroup-484530018642 \
	blockgroup-484530019011 \
	blockgroup-484530019012 \
	blockgroup-484530019013 \
	blockgroup-484530019081 \
	blockgroup-484530019082 \
	blockgroup-484530019101 \
	blockgroup-484530019102 \
	blockgroup-484530019103 \
	blockgroup-484530019104 \
	blockgroup-484530019111 \
	blockgroup-484530019112 \
	blockgroup-484530019121 \
	blockgroup-484530019122 \
	blockgroup-484530019131 \
	blockgroup-484530019132 \
	blockgroup-484530019141 \
	blockgroup-484530019142 \
	blockgroup-484530019143 \
	blockgroup-484530019151 \
	blockgroup-484530019161 \
	blockgroup-484530019162 \
	blockgroup-484530019171 \
	blockgroup-484530019172 \
	blockgroup-484530019173 \
	blockgroup-484530019174 \
	blockgroup-484530019181 \
	blockgroup-484530019182 \
	blockgroup-484530019183 \
	blockgroup-484530019191 \
	blockgroup-484530019192 \
	blockgroup-484530019193 \
	blockgroup-484530020021 \
	blockgroup-484530020022 \
	blockgroup-484530020031 \
	blockgroup-484530020032 \
	blockgroup-484530020041 \
	blockgroup-484530020042 \
	blockgroup-484530020051 \
	blockgroup-484530020052 \
	blockgroup-484530020053 \
	blockgroup-484530021041 \
	blockgroup-484530021042 \
	blockgroup-484530021051 \
	blockgroup-484530021052 \
	blockgroup-484530021053 \
	blockgroup-484530021061 \
	blockgroup-484530021062 \
	blockgroup-484530021063 \
	blockgroup-484530021071 \
	blockgroup-484530021072 \
	blockgroup-484530021073 \
	blockgroup-484530021074 \
	blockgroup-484530021081 \
	blockgroup-484530021082 \
	blockgroup-484530021091 \
	blockgroup-484530021092 \
	blockgroup-484530021093 \
	blockgroup-484530021101 \
	blockgroup-484530021102 \
	blockgroup-484530021111 \
	blockgroup-484530021112 \
	blockgroup-484530021113 \
	blockgroup-484530021121 \
	blockgroup-484530021122 \
	blockgroup-484530021123 \
	blockgroup-484530021131 \
	blockgroup-484530021132 \
	blockgroup-484530021133 \
	blockgroup-484530022011 \
	blockgroup-484530022012 \
	blockgroup-484530022021 \
	blockgroup-484530022022 \
	blockgroup-484530022023 \
	blockgroup-484530022071 \
	blockgroup-484530022072 \
	blockgroup-484530022081 \
	blockgroup-484530022082 \
	blockgroup-484530022083 \
	blockgroup-484530022084 \
	blockgroup-484530022085 \
	blockgroup-484530022091 \
	blockgroup-484530022092 \
	blockgroup-484530022093 \
	blockgroup-484530022101 \
	blockgroup-484530022102 \
	blockgroup-484530022111 \
	blockgroup-484530022121 \
	blockgroup-484530023041 \
	blockgroup-484530023042 \
	blockgroup-484530023043 \
	blockgroup-484530023071 \
	blockgroup-484530023072 \
	blockgroup-484530023073 \
	blockgroup-484530023074 \
	blockgroup-484530023081 \
	blockgroup-484530023082 \
	blockgroup-484530023083 \
	blockgroup-484530023084 \
	blockgroup-484530023101 \
	blockgroup-484530023102 \
	blockgroup-484530023121 \
	blockgroup-484530023122 \
	blockgroup-484530023123 \
	blockgroup-484530023131 \
	blockgroup-484530023132 \
	blockgroup-484530023141 \
	blockgroup-484530023142 \
	blockgroup-484530023143 \
	blockgroup-484530023144 \
	blockgroup-484530023151 \
	blockgroup-484530023152 \
	blockgroup-484530023161 \
	blockgroup-484530023162 \
	blockgroup-484530023163 \
	blockgroup-484530023171 \
	blockgroup-484530023172 \
	blockgroup-484530023181 \
	blockgroup-484530023182 \
	blockgroup-484530023191 \
	blockgroup-484530024021 \
	blockgroup-484530024022 \
	blockgroup-484530024023 \
	blockgroup-484530024024 \
	blockgroup-484530024031 \
	blockgroup-484530024032 \
	blockgroup-484530024071 \
	blockgroup-484530024072 \
	blockgroup-484530024091 \
	blockgroup-484530024092 \
	blockgroup-484530024093 \
	blockgroup-484530024101 \
	blockgroup-484530024102 \
	blockgroup-484530024111 \
	blockgroup-484530024112 \
	blockgroup-484530024113 \
	blockgroup-484530024121 \
	blockgroup-484530024122 \
	blockgroup-484530024123 \
	blockgroup-484530024131 \
	blockgroup-484530024132 \
	blockgroup-484530024133 \
	blockgroup-484530024191 \
	blockgroup-484530024192 \
	blockgroup-484530024211 \
	blockgroup-484530024212 \
	blockgroup-484530024213 \
	blockgroup-484530024221 \
	blockgroup-484530024222 \
	blockgroup-484530024223 \
	blockgroup-484530024231 \
	blockgroup-484530024232 \
	blockgroup-484530024233 \
	blockgroup-484530024241 \
	blockgroup-484530024242 \
	blockgroup-484530024251 \
	blockgroup-484530024252 \
	blockgroup-484530024261 \
	blockgroup-484530024262 \
	blockgroup-484530024271 \
	blockgroup-484530024272 \
	blockgroup-484530024273 \
	blockgroup-484530024274 \
	blockgroup-484530024281 \
	blockgroup-484530024282 \
	blockgroup-484530024291 \
	blockgroup-484530024301 \
	blockgroup-484530024302 \
	blockgroup-484530024303 \
	blockgroup-484530024311 \
	blockgroup-484530024312 \
	blockgroup-484530024313 \
	blockgroup-484530024321 \
	blockgroup-484530024322 \
	blockgroup-484530024331 \
	blockgroup-484530024332 \
	blockgroup-484530024341 \
	blockgroup-484530024351 \
	blockgroup-484530024352 \
	blockgroup-484530024361 \
	blockgroup-484530025001 \
	blockgroup-484530025002 \
	blockgroup-484530025003 \
	blockgroup-484530025004 \
	blockgroup-484539800001 \
	blockgroup-484910203012 \
	blockgroup-484910203021 \
	blockgroup-484910203022 \
	blockgroup-484910203101 \
	blockgroup-484910203102 \
	blockgroup-484910203111 \
	blockgroup-484910203112 \
	blockgroup-484910203121 \
	blockgroup-484910203122 \
	blockgroup-484910203123 \
	blockgroup-484910203124 \
	blockgroup-484910203131 \
	blockgroup-484910203132 \
	blockgroup-484910203133 \
	blockgroup-484910203134 \
	blockgroup-484910203141 \
	blockgroup-484910203142 \
	blockgroup-484910203143 \
	blockgroup-484910203151 \
	blockgroup-484910203152 \
	blockgroup-484910203161 \
	blockgroup-484910203162 \
	blockgroup-484910203171 \
	blockgroup-484910203172 \
	blockgroup-484910203181 \
	blockgroup-484910203182 \
	blockgroup-484910203183 \
	blockgroup-484910203191 \
	blockgroup-484910203192 \
	blockgroup-484910203201 \
	blockgroup-484910203202 \
	blockgroup-484910203203 \
	blockgroup-484910203204 \
	blockgroup-484910203211 \
	blockgroup-484910203212 \
	blockgroup-484910203221 \
	blockgroup-484910203222 \
	blockgroup-484910203223 \
	blockgroup-484910203224 \
	blockgroup-484910203231 \
	blockgroup-484910203232 \
	blockgroup-484910203241 \
	blockgroup-484910203242 \
	blockgroup-484910203243 \
	blockgroup-484910203251 \
	blockgroup-484910203252 \
	blockgroup-484910203261 \
	blockgroup-484910203262 \
	blockgroup-484910203271 \
	blockgroup-484910203272 \
	blockgroup-484910203281 \
	blockgroup-484910203282 \
	blockgroup-484910203283 \
	blockgroup-484910204031 \
	blockgroup-484910204032 \
	blockgroup-484910204041 \
	blockgroup-484910204042 \
	blockgroup-484910204051 \
	blockgroup-484910204052 \
	blockgroup-484910204053 \
	blockgroup-484910204054 \
	blockgroup-484910204061 \
	blockgroup-484910204062 \
	blockgroup-484910204081 \
	blockgroup-484910204082 \
	blockgroup-484910204083 \
	blockgroup-484910204091 \
	blockgroup-484910204092 \
	blockgroup-484910204101 \
	blockgroup-484910204102 \
	blockgroup-484910204103 \
	blockgroup-484910204104 \
	blockgroup-484910204111 \
	blockgroup-484910204112 \
	blockgroup-484910204113 \
	blockgroup-484910205031 \
	blockgroup-484910205032 \
	blockgroup-484910205033 \
	blockgroup-484910205041 \
	blockgroup-484910205042 \
	blockgroup-484910205043 \
	blockgroup-484910205044 \
	blockgroup-484910205051 \
	blockgroup-484910205052 \
	blockgroup-484910205061 \
	blockgroup-484910205062 \
	blockgroup-484910205063 \
	blockgroup-484910205071 \
	blockgroup-484910205072 \
	blockgroup-484910205081 \
	blockgroup-484910205082 \
	blockgroup-484910205091 \
	blockgroup-484910205092 \
	blockgroup-484910205093 \
	blockgroup-484910205101 \
	blockgroup-484910205102 \
	blockgroup-484910205103 \
	blockgroup-484910205104 \
	blockgroup-484910206021 \
	blockgroup-484910206022 \
	blockgroup-484910206023 \
	blockgroup-484910206031 \
	blockgroup-484910206032 \
	blockgroup-484910206033 \
	blockgroup-484910206041 \
	blockgroup-484910206042 \
	blockgroup-484910206051 \
	blockgroup-484910206052 \
	blockgroup-484910207011 \
	blockgroup-484910207012 \
	blockgroup-484910207031 \
	blockgroup-484910207032 \
	blockgroup-484910207033 \
	blockgroup-484910207034 \
	blockgroup-484910207041 \
	blockgroup-484910207042 \
	blockgroup-484910207043 \
	blockgroup-484910207071 \
	blockgroup-484910207072 \
	blockgroup-484910207081 \
	blockgroup-484910207082 \
	blockgroup-484910207083 \
	blockgroup-484910208041 \
	blockgroup-484910208042 \
	blockgroup-484910208044 \
	blockgroup-484910208071 \
	blockgroup-484910208074 \
	blockgroup-484910208081 \
	blockgroup-484910208091 \
	blockgroup-484910209004 \
	blockgroup-484910215021 \
	blockgroup-484910215022 \
	blockgroup-484910215031 \
	blockgroup-484910215032 \
	blockgroup-484910215052 \
	blockgroup-484910215071 \
	blockgroup-484910215081 \
	blockgroup-484910215082 \
	blockgroup-484910215083
