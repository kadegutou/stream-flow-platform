#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include <string>
#include <vector>
#include <sstream>
#include <fstream>

namespace py = pybind11;

/**
 * 高性能 CSV 分块读取
 */
std::vector<std::vector<std::string>> read_csv_chunk(
    const std::string& path,
    char delimiter,
    size_t start_row,
    size_t chunk_size)
{
    std::ifstream file(path);
    if (!file.is_open()) {
        throw std::runtime_error("无法打开文件: " + path);
    }

    std::string line;
    size_t current_row = 0;
    std::vector<std::vector<std::string>> result;

    while (current_row < start_row && std::getline(file, line)) {
        current_row++;
    }

    while (current_row < start_row + chunk_size && std::getline(file, line)) {
        std::vector<std::string> fields;
        std::stringstream ss(line);
        std::string field;
        while (std::getline(ss, field, delimiter)) {
            fields.push_back(field);
        }
        result.push_back(std::move(fields));
        current_row++;
    }
    return result;
}

PYBIND11_MODULE(cpp_csv_utils, m) {
    m.doc() = "CSV 高性能读取工具";
    m.def("read_csv_chunk", &read_csv_chunk,
          "分块读取 CSV 文件",
          py::arg("path"),
          py::arg("delimiter") = ',',
          py::arg("start_row") = 1,
          py::arg("chunk_size") = 10000);
}
