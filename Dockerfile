FROM openscad-base

ARG CMAKE_BUILD_TYPE=Release

COPY . . 
RUN emcmake cmake -B ../build . \
    -DSNAPSHOT=ON \
    -DEXPERIMENTAL=ON \
    -DCMAKE_BUILD_TYPE=${CMAKE_BUILD_TYPE}
RUN cd ../build && make -j6 VERBOSE=1
