DOCKER_TAG_BASE ?= openscad-base
DOCKER_TAG_OPENSCAD ?= openscad

all: build

clean:
	rm -rf libs
	rm -rf build

test:
	cd tests; deno test --allow-read --allow-write --jobs 4

.PHONY: example
example: \
		build/openscad-worker-inlined.js \
		build/libraries/fonts.zip \
		build/libraries/NopSCADlib.zip \
		build/libraries/BOSL.zip \
		build/libraries/BOSL2.zip \
		build/libraries/funcutils.zip \
		build/libraries/FunctionalOpenSCAD.zip \
		build/libraries/YAPP_Box.zip \
		build/libraries/MCAD.zip \
		build/libraries/smooth-prim.zip \
		build/libraries/plot-function.zip \
		build/libraries/closepoints.zip \
		build/libraries/Stemfie_OpenSCAD.zip \
		build/libraries/UB.scad.zip
	cd example; deno run --allow-net --allow-read server.ts

build/libraries/fonts.zip: res/liberation
	mkdir -p build/libraries
	cp res/fonts/fonts.conf res/liberation
	( cd res/liberation && zip -r ../../build/libraries/fonts.zip fonts.conf *.ttf LICENSE AUTHORS )

ENV=Release
ifeq ($(strip $(ENV)),Debug)
DOCKER_FLAGS= --build-arg CMAKE_BUILD_TYPE=Debug --build-arg EMXX_FLAGS="-gsource-map --source-map-base=/"
endif

.PHONY: build
build: build/openscad.js build/openscad.fonts.js

build/openscad.fonts.js: runtime/node_modules runtime/**/* res res/liberation
	mkdir -p build
	cd runtime; npm run build
	cp runtime/dist/* build

runtime/node_modules:
	cd runtime; npm install

build/openscad.js: .image.make
	mkdir -p build
	docker run --name tmpcpy openscad
	docker cp tmpcpy:/build/openscad.js build/
	docker cp tmpcpy:/build/openscad.wasm build/
	docker cp tmpcpy:/build/openscad.wasm.map build/ || true
	docker rm tmpcpy

	sed -i '1s&^&/// <reference types="./openscad.d.ts" />\n&' build/openscad.js

.image.make: .base-image.make Dockerfile
	docker build libs/openscad -f Dockerfile -t $(DOCKER_TAG_OPENSCAD) ${DOCKER_FLAGS}
	touch $@

.base-image.make: libs Dockerfile.base
	docker build libs -f Dockerfile.base -t $(DOCKER_TAG_BASE)
	touch $@

libs: libs/cgal \
	libs/eigen \
	libs/fontconfig \
	libs/freetype \
	libs/glib \
	libs/harfbuzz \
	libs/lib3mf \
	libs/libexpat \
	libs/liblzma \
	libs/libzip \
	libs/openscad \
	libs/boost \
	libs/gmp-6.1.2 \
	libs/mpfr-4.1.0 \
	libs/zlib \
	libs/libxml2 \
	libs/doubleconversion

SINGLE_BRANCH_MAIN=--branch main --single-branch
SINGLE_BRANCH=--branch master --single-branch
SHALLOW=--depth 1

libs/cgal:
	git clone --recurse https://github.com/ochafik/cgal.git --branch interval-free-epeck --single-branch $@
	# git clone https://github.com/CGAL/cgal.git ${SHALLOW} ${SINGLE_BRANCH} $@

libs/eigen:
	git clone https://github.com/PX4/eigen.git ${SHALLOW} ${SINGLE_BRANCH} $@

libs/fontconfig:
	git clone https://gitlab.freedesktop.org/fontconfig/fontconfig.git ${SHALLOW} ${SINGLE_BRANCH_MAIN} $@
	git -C $@ apply ../../patches/fontconfig.patch 

libs/freetype:
	git clone https://gitlab.freedesktop.org/freetype/freetype.git ${SHALLOW} ${SINGLE_BRANCH} $@

libs/glib:
	git clone https://gist.github.com/acfa1c09522705efa5eb0541d2d00887.git ${SHALLOW} ${SINGLE_BRANCH} $@
	git -C $@ apply ../../patches/glib.patch 

libs/harfbuzz:
	git clone https://github.com/harfbuzz/harfbuzz.git ${SHALLOW} ${SINGLE_BRANCH_MAIN} $@

libs/lib3mf:
	git clone https://github.com/3MFConsortium/lib3mf.git ${SHALLOW} ${SINGLE_BRANCH} $@

libs/libexpat:
	git clone  https://github.com/libexpat/libexpat ${SHALLOW} ${SINGLE_BRANCH} $@

libs/liblzma:
	git clone https://github.com/kobolabs/liblzma.git ${SHALLOW} ${SINGLE_BRANCH} $@

libs/libzip:
	git clone https://github.com/nih-at/libzip.git ${SHALLOW} ${SINGLE_BRANCH} $@

libs/zlib:
	git clone https://github.com/madler/zlib.git ${SHALLOW} ${SINGLE_BRANCH} $@

libs/libxml2:
	git clone https://gitlab.gnome.org/GNOME/libxml2.git ${SHALLOW} ${SINGLE_BRANCH} $@

libs/doubleconversion:
	git clone https://github.com/google/double-conversion ${SHALLOW} ${SINGLE_BRANCH} $@

libs/openscad:
	git clone --recurse https://github.com/ochafik/openscad.git --branch unfiltered-lazy --single-branch $@
	 #git clone --recurse https://github.com/ochafik/openscad.git --branch filtered-number --single-branch $@

libs/boost:
	git clone --recurse https://github.com/boostorg/boost.git ${SHALLOW} ${SINGLE_BRANCH} $@
	git -C $@/libs/filesystem apply ../../../../patches/boost-filesystem.patch

libs/gmp-6.1.2:
	wget https://gmplib.org/download/gmp/gmp-6.1.2.tar.lz
	tar xf gmp-6.1.2.tar.lz -C libs
	rm gmp-6.1.2.tar.lz

libs/mpfr-4.1.0:
	wget  https://www.mpfr.org/mpfr-current/mpfr-4.1.0.tar.xz
	tar xf mpfr-4.1.0.tar.xz -C libs
	rm mpfr-4.1.0.tar.xz


libs/BOSL2: 
	git clone --recurse https://github.com/revarbat/BOSL2.git ${SHALLOW} ${SINGLE_BRANCH} $@

build/libraries/BOSL2.zip: libs/BOSL2
	mkdir -p build/libraries
	( cd libs/BOSL2 ; zip -r ../../build/libraries/BOSL2.zip *.scad LICENSE )

libs/BOSL: 
	git clone --recurse https://github.com/revarbat/BOSL.git ${SHALLOW} ${SINGLE_BRANCH} $@

build/libraries/BOSL.zip: libs/BOSL
	mkdir -p build/libraries
	( cd libs/BOSL ; zip -r ../../build/libraries/BOSL.zip *.scad LICENSE )

libs/NopSCADlib: 
	git clone --recurse https://github.com/nophead/NopSCADlib.git ${SHALLOW} ${SINGLE_BRANCH} $@

build/libraries/NopSCADlib.zip: libs/NopSCADlib
	mkdir -p build/libraries
	( cd libs/NopSCADlib ; zip -r ../../build/libraries/NopSCADlib.zip `find . -name '*.scad' | grep -v tests | grep -v examples` COPYING )

libs/funcutils: 
	git clone --recurse https://github.com/thehans/funcutils.git ${SHALLOW} ${SINGLE_BRANCH} $@

build/libraries/funcutils.zip: libs/funcutils
	mkdir -p build/libraries
	( cd libs/funcutils ; zip -r ../../build/libraries/funcutils.zip *.scad LICENSE )

libs/FunctionalOpenSCAD: 
	git clone --recurse https://github.com/thehans/FunctionalOpenSCAD.git ${SHALLOW} ${SINGLE_BRANCH} $@

build/libraries/FunctionalOpenSCAD.zip: libs/FunctionalOpenSCAD
	mkdir -p build/libraries
	( cd libs/FunctionalOpenSCAD ; zip -r ../../build/libraries/FunctionalOpenSCAD.zip *.scad LICENSE )

libs/YAPP_Box: 
	git clone --recurse https://github.com/mrWheel/YAPP_Box.git ${SHALLOW} ${SINGLE_BRANCH_MAIN} $@

build/libraries/YAPP_Box.zip: libs/YAPP_Box
	mkdir -p build/libraries
	( cd libs/YAPP_Box ; zip -r ../../build/libraries/YAPP_Box.zip *.scad LICENSE )

libs/MCAD: 
	git clone --recurse https://github.com/openscad/MCAD.git ${SHALLOW} ${SINGLE_BRANCH} $@

build/libraries/MCAD.zip: libs/MCAD
	mkdir -p build/libraries
	( cd libs/MCAD ; zip -r ../../build/libraries/MCAD.zip *.scad bitmap/*.scad LICENSE )

libs/Stemfie_OpenSCAD: 
	git clone --recurse https://github.com/Cantareus/Stemfie_OpenSCAD.git ${SHALLOW} ${SINGLE_BRANCH_MAIN} $@

build/libraries/Stemfie_OpenSCAD.zip: libs/Stemfie_OpenSCAD
	mkdir -p build/libraries
	( cd libs/Stemfie_OpenSCAD ; zip -r ../../build/libraries/Stemfie_OpenSCAD.zip *.scad LICENSE )

# libs/threads: 
# 	git clone --recurse https://github.com/rcolyer/threads.git ${SHALLOW} ${SINGLE_BRANCH} $@

# build/libraries/threads.zip: libs/threads
# 	mkdir -p build/libraries
# 	( cd libs/threads ; zip -r ../../build/libraries/threads.zip *.scad LICENSE.txt )

libs/smooth-prim: 
	git clone --recurse https://github.com/rcolyer/smooth-prim.git ${SHALLOW} ${SINGLE_BRANCH} $@

build/libraries/smooth-prim.zip: libs/smooth-prim
	mkdir -p build/libraries
	( cd libs/smooth-prim ; zip -r ../../build/libraries/smooth-prim.zip *.scad LICENSE.txt )

libs/plot-function: 
	git clone --recurse https://github.com/rcolyer/plot-function.git ${SHALLOW} ${SINGLE_BRANCH} $@

build/libraries/plot-function.zip: libs/plot-function
	mkdir -p build/libraries
	( cd libs/plot-function ; zip -r ../../build/libraries/plot-function.zip *.scad LICENSE.txt )

libs/closepoints: 
	git clone --recurse https://github.com/rcolyer/closepoints.git ${SHALLOW} ${SINGLE_BRANCH} $@

build/libraries/closepoints.zip: libs/closepoints
	mkdir -p build/libraries
	( cd libs/closepoints ; zip -r ../../build/libraries/closepoints.zip *.scad LICENSE.txt )

libs/UB.scad: 
	git clone --recurse https://github.com/UBaer21/UB.scad.git ${SHALLOW} ${SINGLE_BRANCH_MAIN} $@

build/libraries/UB.scad.zip: libs/UB.scad
	mkdir -p build/libraries
	( cd libs/UB.scad ; zip -r ../../build/libraries/UB.scad.zip libraries/*.scad LICENSE )

# libs/openscad-tray: 
# 	git clone --recurse https://github.com/sofian/openscad-tray.git ${SHALLOW} ${SINGLE_BRANCH_MAIN} $@

# build/libraries/openscad-tray.zip: libs/openscad-tray
# 	mkdir -p build/libraries
# 	( cd libs/openscad-tray ; zip -r ../../build/libraries/openscad-tray.zip *.scad LICENSE.txt )

build/openscad-worker-inlined.js: example/www/openscad-worker.js inline-openscad-worker.ts
	deno run --allow-net --allow-read --allow-write inline-openscad-worker.ts

build/site-dist.zip: build/openscad.js build/openscad-worker-inlined.js
	mkdir -p dist/openscad
	cp build/openscad* dist/openscad
	cp example/www/* dist/openscad
	( cd dist && zip -r ../build/site-dist.zip openscad )
	ls -l build/site-dist.zip

site: build/site-dist.zip
res: \
	res/liberation

res/liberation:
	git clone --recurse https://github.com/shantigilbert/liberation-fonts-ttf.git ${SHALLOW} ${SINGLE_BRANCH} $@
