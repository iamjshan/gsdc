/**
 * import.js - Excel台账导入功能
 * 使用 SheetJS (xlsx.js) 解析 Excel 文件
 */

var ImportManager = (function() {
    var currentImportType = ''; // 'central' or 'dispersed'

    // 触发文件选择
    function triggerImport(type) {
        currentImportType = type;
        
        // 5+App 环境使用原生文件选择器
        if (window.plus && plus.android) {
            try {
                var main = plus.android.runtimeMainActivity();
                var Intent = plus.android.importClass("android.content.Intent");
                var intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.setType("*/*");
                
                main.onActivityResult = function(requestCode, resultCode, data) {
                    if (resultCode == -1 && data) {
                        var uri = data.getData();
                        var path = uri.toString();
                        handleAppFile(path, uri);
                    }
                };
                
                main.startActivityForResult(intent, 1);
            } catch(e) {
                console.error('App文件选择失败:', e);
                fallbackToInput();
            }
        } else {
            fallbackToInput();
        }
    }
    
    // 降级到 input
    function fallbackToInput() {
        var input = document.getElementById('fileInput');
        if (input) {
            input.value = '';
            input.click();
        }
    }
    
    // 处理 App 环境选择的文件
    function handleAppFile(path, uri) {
        if (!path) {
            Utils.showToast('文件路径错误');
            return;
        }
        
        // 尝试从路径中提取文件名和扩展名
        var fileName = path.substring(path.lastIndexOf('/') + 1);
        var ext = '';
        var dotIndex = fileName.lastIndexOf('.');
        if (dotIndex > 0) {
            ext = fileName.substring(dotIndex + 1).toLowerCase();
        }
        
        // 显示进度
        var progressDiv = document.getElementById('importProgress');
        if (progressDiv) progressDiv.style.display = 'block';
        updateProgress(10, '正在读取文件...');
        
        // 使用 plus.io 读取文件
        try {
            plus.io.resolveLocalFileSystemURL(path, function(entry) {
                entry.file(function(file) {
                    var reader = new plus.io.FileReader();
                    
                    reader.onloadend = function(evt) {
                        updateProgress(40, '正在解析数据...');
                        var content = evt.target.result;
                        
                        if (ext === 'csv' || ext === 'txt' || content.indexOf(',') >= 0) {
                            parseCSVFile(content, currentImportType);
                        } else {
                            Utils.showToast('请选择 CSV 格式文件');
                            if (progressDiv) progressDiv.style.display = 'none';
                        }
                    };
                    
                    reader.onerror = function() {
                        Utils.showToast('文件读取失败');
                        if (progressDiv) progressDiv.style.display = 'none';
                    };
                    
                    reader.readAsText(file, 'utf-8');
                });
            }, function(e) {
                // 尝试直接用路径读取
                tryReadFileByPath(path);
            });
        } catch(e) {
            tryReadFileByPath(path);
        }
    }
    
    // 尝试通过路径直接读取
    function tryReadFileByPath(filePath) {
        var progressDiv = document.getElementById('importProgress');
        
        // 尝试下载文件到本地缓存
        var dtask = plus.downloader.createDownload(filePath, {}, function(d, status) {
            if (status == 200) {
                plus.io.resolveLocalFileSystemURL(d.filename, function(entry) {
                    entry.file(function(file) {
                        var reader = new plus.io.FileReader();
                        reader.onloadend = function(evt) {
                            updateProgress(40, '正在解析数据...');
                            parseCSVFile(evt.target.result, currentImportType);
                        };
                        reader.onerror = function() {
                            Utils.showToast('文件读取失败');
                            if (progressDiv) progressDiv.style.display = 'none';
                        };
                        reader.readAsText(file, 'utf-8');
                    });
                });
            } else {
                Utils.showToast('无法访问该文件，请使用 CSV 格式');
                if (progressDiv) progressDiv.style.display = 'none';
            }
        });
        dtask.start();
    }
    
    // 解析 CSV 文件
    function parseCSVFile(content, type) {
        var lines = content.split('\n').filter(function(l) { return l.trim(); });
        if (lines.length < 2) {
            Utils.showToast('CSV 文件格式不正确');
            return;
        }
        
        // 根据类型调用不同的解析方法
        var stations = [];
        if (type === 'central') {
            stations = parseCentralCSV(lines);
        } else {
            stations = parseDispersedCSV(lines);
        }
        
        saveImportedStations(stations, type);
    }
    
    // 解析集中式 CSV
    function parseCentralCSV(lines) {
        var stations = [];
        // CSV 解析逻辑
        for (var i = 1; i < lines.length; i++) {
            var cols = lines[i].split(',');
            if (!cols[0]) continue;
            
            var station = {
                id: 'C' + Date.now() + i,
                type: 'central',
                name: cols[4] || cols[0],
                county: cols[3] || '',
                town: '',
                village: '',
                province: '黑龙江省',
                city: '绥化市',
                lat: '',
                lng: '',
                createTime: new Date().toISOString()
            };
            stations.push(station);
        }
        return stations;
    }
    
    // 解析分散式 CSV
    function parseDispersedCSV(lines) {
        var stations = [];
        for (var i = 1; i < lines.length; i++) {
            var cols = lines[i].split(',');
            if (!cols[0]) continue;
            
            var station = {
                id: 'D' + Date.now() + i,
                type: 'dispersed',
                name: (cols[6] || cols[5] || '站点') + '供水点',
                county: cols[3] || '',
                town: cols[4] || '',
                village: cols[5] || '',
                hamlet: cols[6] || '',
                population: cols[15] || '',
                province: '黑龙江省',
                city: '绥化市',
                lat: '',
                lng: '',
                createTime: new Date().toISOString()
            };
            stations.push(station);
        }
        return stations;
    }
    
    // 从 base64 解析 Excel
    function parseExcelFromBase64(base64Data, ext, type) {
        // 移除 data URL 前缀
        var base64 = base64Data;
        if (base64.indexOf('base64,') >= 0) {
            base64 = base64.split('base64,')[1];
        }
        
        // 转换为二进制
        var binary = atob(base64);
        var array = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) {
            array[i] = binary.charCodeAt(i);
        }
        
        // 调用原有的 parseExcel 方法
        parseExcel(array.buffer, ext, type);
    }
    
    // 保存导入的站点
    function saveImportedStations(stations, type) {
        updateProgress(80, '正在保存...');
        
        setTimeout(function() {
            if (type === 'central') {
                var existing = Storage.getCentralStations();
                var merged = mergeStations(existing, stations, 'central');
                Storage.saveCentralStations(merged);
            } else {
                var existing = Storage.getDispersedStations();
                var merged = mergeStations(existing, stations, 'dispersed');
                Storage.saveDispersedStations(merged);
            }
            
            updateProgress(100, '导入完成！共 ' + stations.length + ' 条');
            setTimeout(function() {
                var progressDiv = document.getElementById('importProgress');
                if (progressDiv) progressDiv.style.display = 'none';
                App.refreshStats();
                Utils.showToast('导入成功！共导入 ' + stations.length + ' 个站点', 3000);
                App.goBack();
            }, 1500);
        }, 300);
    }

    // 处理文件导入
    function handleFileImport(event) {
        var file = event.target.files[0];
        if (!file) return;
        
        var ext = file.name.split('.').pop().toLowerCase();
        if (['xls','xlsx','csv'].indexOf(ext) < 0) {
            Utils.showToast('请选择 Excel 文件（.xls / .xlsx）');
            return;
        }
        
        // 显示进度
        var progressDiv = document.getElementById('importProgress');
        if (progressDiv) progressDiv.style.display = 'block';
        updateProgress(0, '正在读取文件...');
        
        var reader = new FileReader();
        reader.onload = function(e) {
            updateProgress(30, '正在解析数据...');
            setTimeout(function() {
                parseExcel(e.target.result, ext, currentImportType);
            }, 100);
        };
        reader.onerror = function() {
            Utils.showToast('文件读取失败');
            if (progressDiv) progressDiv.style.display = 'none';
        };
        reader.readAsArrayBuffer(file);
    }

    // 更新进度
    function updateProgress(percent, text) {
        var bar = document.getElementById('progressBar');
        var label = document.getElementById('progressText');
        if (bar) bar.style.width = percent + '%';
        if (label) label.textContent = text || percent + '%';
    }

    // 解析Excel (需要 SheetJS 库)
    function parseExcel(buffer, ext, type) {
        try {
            if (typeof XLSX === 'undefined') {
                // SheetJS 未加载，尝试动态加载
                loadSheetJS(function() {
                    parseExcel(buffer, ext, type);
                });
                return;
            }
            
            var data = new Uint8Array(buffer);
            var workbook = XLSX.read(data, { type: 'array', cellDates: true });
            var sheetName = workbook.SheetNames[0];
            var sheet = workbook.Sheets[sheetName];
            var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            
            updateProgress(60, '正在处理数据...');
            
            var stations = [];
            if (type === 'central') {
                stations = parseCentralRows(rows);
            } else {
                stations = parseDispersedRows(rows);
            }
            
            updateProgress(80, '正在保存...');
            
            // 保存数据
            setTimeout(function() {
                if (type === 'central') {
                    var existing = Storage.getCentralStations();
                    var merged = mergeStations(existing, stations, 'central');
                    Storage.saveCentralStations(merged);
                } else {
                    var existing = Storage.getDispersedStations();
                    var merged = mergeStations(existing, stations, 'dispersed');
                    Storage.saveDispersedStations(merged);
                }
                
                updateProgress(100, '导入完成！共 ' + stations.length + ' 条');
                setTimeout(function() {
                    var progressDiv = document.getElementById('importProgress');
                    if (progressDiv) progressDiv.style.display = 'none';
                    App.refreshStats();
                    Utils.showToast('导入成功！共导入 ' + stations.length + ' 个站点', 3000);
                    App.goBack();
                }, 1500);
            }, 300);
            
        } catch(e) {
            console.error('解析Excel失败:', e);
            Utils.showToast('解析失败：' + (e.message || '格式错误'));
            var progressDiv = document.getElementById('importProgress');
            if (progressDiv) progressDiv.style.display = 'none';
        }
    }

    // 解析集中式台账行
    // 格式：行5起 = [序号, 省, 市, 县, 工程名称, 工程类型, 投资额, 开始供水时间, 建成时间, 验收, 位置, ...]
    function parseCentralRows(rows) {
        var stations = [];
        var dataStart = 5; // 从第5行(索引5)开始是数据
        
        // 自动检测数据起始行（找到序号为数字的行）
        for (var i = 1; i < Math.min(rows.length, 10); i++) {
            var first = rows[i][0];
            if (typeof first === 'number' && first > 0) {
                dataStart = i;
                break;
            }
        }
        
        for (var i = dataStart; i < rows.length; i++) {
            var row = rows[i];
            // 跳过空行和合计行
            if (!row || !row[0]) continue;
            var seq = row[0];
            if (isNaN(Number(seq))) continue;
            
            var name = Utils.toStr(row[4]);
            if (!name || name === '合计') continue;
            
            // 处理合并单元格（县区可能在上一行有值）
            var county = Utils.toStr(row[3]);
            if (!county && i > dataStart) {
                for (var k = i-1; k >= dataStart; k--) {
                    if (rows[k] && rows[k][3]) { county = Utils.toStr(rows[k][3]); break; }
                }
            }
            
            var station = {
                id: '',
                type: 'central',
                seq: Utils.toNum(row[0]),
                province: Utils.toStr(row[1]) || '黑龙江省',
                city: Utils.toStr(row[2]) || '绥化市',
                county: county,
                name: name,
                stationType: Utils.toStr(row[5]),
                investment: Utils.toNum(row[6]),
                startSupplyDate: formatExcelDate(row[7]),
                completionDate: formatExcelDate(row[8]),
                accepted: Utils.toStr(row[9]),
                location: Utils.toStr(row[10]),
                supplyRange: Utils.toStr(row[11]),
                town: '',
                village: '',
                lat: '',
                lng: '',
                createTime: new Date().toISOString()
            };
            
            // 从 location/supplyRange 中尝试提取乡镇村信息
            var loc = station.location || station.supplyRange;
            if (loc) {
                station.town = extractTownFromStr(loc);
                station.village = extractVillageFromStr(loc);
            }
            
            station.id = (station.type === 'central' ? 'C' : 'D') + 
                         (station.county || '') + '-' + station.seq + '-' + Date.now();
            
            stations.push(station);
        }
        return stations;
    }

    // 解析分散式台账行
    // 格式：行3起 = [序号, 省, 市, 县, 乡镇, 行政村, 自然屯, 供水工程数小计, ...水源类型..., 人口, 水质检测, 填表人, 联系方式]
    function parseDispersedRows(rows) {
        var stations = [];
        var dataStart = 3;
        
        for (var i = 1; i < Math.min(rows.length, 6); i++) {
            var first = rows[i][0];
            if (typeof first === 'number' && first > 0) {
                dataStart = i;
                break;
            }
        }
        
        for (var i = dataStart; i < rows.length; i++) {
            var row = rows[i];
            if (!row || !row[0]) continue;
            if (isNaN(Number(row[0]))) continue;
            
            var village = Utils.toStr(row[5]);
            var hamlet = Utils.toStr(row[6]);
            if (!village && !hamlet) continue;
            
            var station = {
                id: '',
                type: 'dispersed',
                seq: Utils.toNum(row[0]),
                province: Utils.toStr(row[1]) || '黑龙江省',
                city: Utils.toStr(row[2]) || '绥化市',
                county: Utils.toStr(row[3]),
                town: Utils.toStr(row[4]),
                village: village,
                hamlet: hamlet,
                name: (hamlet || village) + '分散供水点',
                projectCount: Utils.toNum(row[7]),
                waterSourceRiver: Utils.toNum(row[8]),
                waterSourcePond: Utils.toNum(row[9]),
                waterSourceWell: Utils.toNum(row[10]),
                waterSourceTank: Utils.toNum(row[11]),
                waterSourceStream: Utils.toNum(row[12]),
                waterSourceSelfWell: Utils.toNum(row[13]),
                waterSourceOther: Utils.toNum(row[14]),
                population: Utils.toNum(row[15]),
                waterQualityResult: Utils.toStr(row[16]),
                contactPerson: Utils.toStr(row[17]),
                contactPhone: Utils.toStr(row[18]),
                lat: '',
                lng: '',
                createTime: new Date().toISOString()
            };
            
            // 站点名称优化
            if (station.hamlet) {
                station.name = station.hamlet + '屯';
            } else if (station.village) {
                station.name = station.village + '村';
            }
            
            station.id = 'D' + (station.county || '') + '-' + station.seq + '-' + Date.now();
            stations.push(station);
        }
        return stations;
    }

    // 合并站点（按名称去重）
    function mergeStations(existing, newOnes, type) {
        var nameMap = {};
        existing.forEach(function(s) { nameMap[s.name + s.county] = true; });
        var added = 0;
        newOnes.forEach(function(s) {
            if (!nameMap[s.name + s.county]) {
                existing.push(s);
                added++;
            }
        });
        return existing;
    }

    // 处理Excel日期
    function formatExcelDate(val) {
        if (!val) return '';
        if (val instanceof Date) {
            return val.getFullYear() + '-' + String(val.getMonth()+1).padStart(2,'0') + '-' + String(val.getDate()).padStart(2,'0');
        }
        return String(val).trim().replace(/\n/g, '').slice(0, 10);
    }

    // 从字符串提取乡镇
    function extractTownFromStr(str) {
        if (!str) return '';
        var m = str.match(/([^\s]{2,10}[镇乡街道])/);
        return m ? m[1] : '';
    }

    // 从字符串提取村
    function extractVillageFromStr(str) {
        if (!str) return '';
        var m = str.match(/([^\s]{2,10}村)/);
        return m ? m[1] : '';
    }

    // 动态加载 SheetJS
    var _sheetJSLoaded = false;
    var _sheetJSCbs = [];
    function loadSheetJS(cb) {
        if (_sheetJSLoaded) { cb(); return; }
        _sheetJSCbs.push(cb);
        if (_sheetJSCbs.length > 1) return;
        
        var script = document.createElement('script');
        script.src = 'js/lib/xlsx.full.min.js';
        script.onload = function() {
            _sheetJSLoaded = true;
            _sheetJSCbs.forEach(function(fn){ fn(); });
            _sheetJSCbs = [];
        };
        script.onerror = function() {
            Utils.showToast('Excel解析库加载失败，请检查网络');
            _sheetJSCbs = [];
        };
        document.head.appendChild(script);
    }

    // 导出数据为CSV（用于调试）
    function exportToCSV(type) {
        var stations = type === 'central' 
            ? Storage.getCentralStations() 
            : Storage.getDispersedStations();
        
        if (!stations.length) {
            Utils.showToast('无数据可导出');
            return;
        }
        
        var headers = type === 'central'
            ? ['序号','县区','工程名称','工程类型','所在位置','投资额(万元)','开始供水时间']
            : ['序号','县区','乡镇','行政村','自然屯','供水人口','水质'];
        
        var lines = [headers.join(',')];
        stations.forEach(function(s, i) {
            var row;
            if (type === 'central') {
                row = [i+1, s.county, s.name, s.stationType, s.location, s.investment, s.startSupplyDate];
            } else {
                row = [i+1, s.county, s.town, s.village, s.hamlet, s.population, s.waterQualityResult];
            }
            lines.push(row.map(function(v){ return '"' + String(v||'').replace(/"/g,'""') + '"'; }).join(','));
        });
        
        var csvContent = '\ufeff' + lines.join('\n');
        downloadText(csvContent, (type === 'central' ? '集中式' : '分散式') + '台账.csv', 'text/csv');
    }

    function downloadText(content, filename, mime) {
        var blob = new Blob([content], { type: mime || 'text/plain' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    return {
        triggerImport: triggerImport,
        handleFileImport: handleFileImport,
        exportToCSV: exportToCSV,
        loadSheetJS: loadSheetJS
    };
})();

// 全局挂载
window.triggerImport = function(type) { 
    if (typeof ImportManager !== 'undefined') {
        ImportManager.triggerImport(type); 
    } else {
        console.error('ImportManager 未加载');
        alert('导入模块加载失败，请刷新页面重试');
    }
};
window.handleFileImport = function(event) { 
    if (typeof ImportManager !== 'undefined') {
        ImportManager.handleFileImport(event); 
    } else {
        console.error('ImportManager 未加载');
    }
};
