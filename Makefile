DOCKER_TAG_BASE ?= openscad-base
DOCKER_TAG_OPENSCAD ?= openscad

all: build

clean:
	rm -rf libs
	rm -rf build

test:
	cd tests; deno test --allow-read --allow-write --jobs 4

.PHONY: example
example:
	cd example; deno run --allow-net --allow-read server.ts

ENV=Release
ifeq ($(strip $(ENV)),Debug)
DOCKER_FLAGS= --build-arg CMAKE_BUILD_TYPE=Debug --build-arg EMXX_FLAGS="-gsource-map --source-map-base=/"
endif

.PHONY: build
build: build/openscad.wasm.js build/openscad.fonts.js

build/openscad.fonts.js: runtime/node_modules runtime/**/* res
	mkdir -p build
	cd runtime; npm run build
	cp runtime/dist/* build

runtime/node_modules:
	cd runtime; npm install

build/openscad.wasm.js: .image.make
	mkdir -p build
	docker run --name tmpcpy $(DOCKER_TAG_OPENSCAD)
	docker cp tmpcpy:/build/openscad.js build/openscad.wasm.js
	docker cp tmpcpy:/build/openscad.wasm build/
	docker cp tmpcpy:/build/openscad.wasm.map build/ || true
	docker rm tmpcpy

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
	git clone https://github.com/CGAL/cgal.git ${SHALLOW} --branch v5.4.5 --single-branch $@

libs/eigen:
	git clone https://github.com/PX4/eigen.git ${SHALLOW} ${SINGLE_BRANCH} $@

libs/fontconfig:
	git clone https://gitlab.freedesktop.org/fontconfig/fontconfig ${SHALLOW} ${SINGLE_BRANCH_MAIN} $@
	git -C $@ apply ../../patches/fontconfig.patch 

libs/freetype:
	git clone https://github.com/freetype/freetype.git ${SHALLOW} ${SINGLE_BRANCH} $@

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
	git clone https://github.com/nih-at/libzip.git ${SHALLOW} ${SINGLE_BRANCH_MAIN} $@

libs/zlib:
	git clone https://github.com/madler/zlib.git ${SHALLOW} ${SINGLE_BRANCH} $@

libs/libxml2:
	git clone https://gitlab.gnome.org/GNOME/libxml2.git ${SHALLOW} ${SINGLE_BRANCH} $@

libs/doubleconversion:
	git clone https://github.com/google/double-conversion ${SHALLOW} ${SINGLE_BRANCH} $@

libs/openscad:
	git clone --recurse https://github.com/ochafik/openscad.git --branch simpler-wasm ${SHALLOW} ${SINGLE_BRANCH} $@

libs/boost:
	git clone --recurse https://github.com/boostorg/boost.git ${SHALLOW} ${SINGLE_BRANCH} $@

libs/gmp-6.1.2:
	wget https://gmplib.org/download/gmp/gmp-6.1.2.tar.lz
	tar xf gmp-6.1.2.tar.lz -C libs
	rm gmp-6.1.2.tar.lz

libs/mpfr-4.1.0:
	wget  https://www.mpfr.org/mpfr-4.1.0/mpfr-4.1.0.tar.xz
	tar xf mpfr-4.1.0.tar.xz -C libs
	rm mpfr-4.1.0.tar.xz

res: \
	res/liberation \
	res/MCAD

res/liberation:
	git clone --recurse https://github.com/shantigilbert/liberation-fonts-ttf.git ${SHALLOW} ${SINGLE_BRANCH} $@

res/MCAD:
	git clone https://github.com/openscad/MCAD.git ${SHALLOW} ${SINGLE_BRANCH} $@
