cmake_minimum_required(VERSION 3.16)
project(cpp_components)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_subdirectory(pybind11)

pybind11_add_module(cpp_components
    src/concat.cpp
    src/csv_utils.cpp
)

target_include_directories(cpp_components PRIVATE src)

# MinGW 下静态链接运行时，避免 .pyd 依赖 libgcc/libstdc++ DLL
if(MINGW)
    target_link_options(cpp_components PRIVATE -static-libgcc -static-libstdc++ -static)
endif()
