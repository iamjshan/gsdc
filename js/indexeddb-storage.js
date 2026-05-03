/**
 * indexeddb-storage.js - 使用 IndexedDB 存储数据，突破 LocalStorage 5MB 限制
 */

var IndexedDBStorage = (function() {
    var DB_NAME = 'GroundwaterDB';
    var DB_VERSION = 1;
    var db = null;
    
    // 初始化 IndexedDB
    async function init() {
        return new Promise(function(resolve, reject) {
            if (db) {
                resolve(db);
                return;
            }
            
            var request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = function(event) {
                console.error('IndexedDB 初始化失败:', event.target.error);
                reject(event.target.error);
            };
            
            request.onsuccess = function(event) {
                db = event.target.result;
                console.log('IndexedDB 初始化成功');
                resolve(db);
            };
            
            request.onupgradeneeded = function(event) {
                var database = event.target.result;
                
                // 创建站点存储
                if (!database.objectStoreNames.contains('stations')) {
                    var stationStore = database.createObjectStore('stations', { keyPath: 'id' });
                    stationStore.createIndex('type', 'type', { unique: false });
                    stationStore.createIndex('county', 'county', { unique: false });
                }
                
                // 创建调查记录存储
                if (!database.objectStoreNames.contains('surveys')) {
                    var surveyStore = database.createObjectStore('surveys', { keyPath: 'stationId' });
                    surveyStore.createIndex('updateTime', 'updateTime', { unique: false });
                }
                
                // 创建草稿存储
                if (!database.objectStoreNames.contains('drafts')) {
                    database.createObjectStore('drafts', { keyPath: 'stationId' });
                }
                
                // 创建照片存储
                if (!database.objectStoreNames.contains('photos')) {
                    database.createObjectStore('photos', { keyPath: 'id', autoIncrement: true });
                }
                
                console.log('IndexedDB 对象存储创建完成');
            };
        });
    }
    
    // 设置值
    async function set(storeName, key, value) {
        await init();
        return new Promise(function(resolve, reject) {
            var transaction = db.transaction([storeName], 'readwrite');
            var store = transaction.objectStore(storeName);
            
            var request = store.put(value);
            
            request.onsuccess = function() {
                resolve(true);
            };
            
            request.onerror = function(event) {
                console.error('IndexedDB set error:', event.target.error);
                reject(event.target.error);
            };
        });
    }
    
    // 获取值
    async function get(storeName, key) {
        await init();
        return new Promise(function(resolve, reject) {
            var transaction = db.transaction([storeName], 'readonly');
            var store = transaction.objectStore(storeName);
            
            var request = store.get(key);
            
            request.onsuccess = function() {
                resolve(request.result);
            };
            
            request.onerror = function(event) {
                console.error('IndexedDB get error:', event.target.error);
                reject(event.target.error);
            };
        });
    }
    
    // 获取所有值
    async function getAll(storeName) {
        await init();
        return new Promise(function(resolve, reject) {
            var transaction = db.transaction([storeName], 'readonly');
            var store = transaction.objectStore(storeName);
            
            var request = store.getAll();
            
            request.onsuccess = function() {
                resolve(request.result);
            };
            
            request.onerror = function(event) {
                console.error('IndexedDB getAll error:', event.target.error);
                reject(event.target.error);
            };
        });
    }
    
    // 删除值
    async function remove(storeName, key) {
        await init();
        return new Promise(function(resolve, reject) {
            var transaction = db.transaction([storeName], 'readwrite');
            var store = transaction.objectStore(storeName);
            
            var request = store.delete(key);
            
            request.onsuccess = function() {
                resolve(true);
            };
            
            request.onerror = function(event) {
                console.error('IndexedDB remove error:', event.target.error);
                reject(event.target.error);
            };
        });
    }
    
    // 清空存储
    async function clear(storeName) {
        await init();
        return new Promise(function(resolve, reject) {
            var transaction = db.transaction([storeName], 'readwrite');
            var store = transaction.objectStore(storeName);
            
            var request = store.clear();
            
            request.onsuccess = function() {
                resolve(true);
            };
            
            request.onerror = function(event) {
                console.error('IndexedDB clear error:', event.target.error);
                reject(event.target.error);
            };
        });
    }
    
    // 批量保存站点
    async function saveStations(stations) {
        await init();
        return new Promise(function(resolve, reject) {
            var transaction = db.transaction(['stations'], 'readwrite');
            var store = transaction.objectStore('stations');
            
            var count = 0;
            stations.forEach(function(station) {
                var request = store.put(station);
                request.onsuccess = function() {
                    count++;
                    if (count === stations.length) {
                        resolve(true);
                    }
                };
                request.onerror = function() {
                    console.error('保存站点失败:', station.id);
                };
            });
            
            transaction.oncomplete = function() {
                console.log('批量保存站点完成:', stations.length, '个');
                resolve(true);
            };
            
            transaction.onerror = function(event) {
                console.error('批量保存站点失败:', event.target.error);
                reject(event.target.error);
            };
        });
    }
    
    // 获取所有站点
    async function getAllStations() {
        return await getAll('stations');
    }
    
    // 批量保存调查记录
    async function saveSurveys(surveys) {
        await init();
        return new Promise(function(resolve, reject) {
            var transaction = db.transaction(['surveys'], 'readwrite');
            var store = transaction.objectStore('surveys');
            
            var count = 0;
            var surveyList = Array.isArray(surveys) ? surveys : Object.values(surveys);
            
            console.log('IndexedDB saveSurveys: 准备保存', surveyList.length, '条调查记录');
            
            surveyList.forEach(function(survey) {
                var data = Object.assign({}, survey);
                data.stationId = survey.stationId || survey.id || survey.station_id;
                
                if (!data.stationId) {
                    console.error('IndexedDB saveSurveys: 调查记录缺少 stationId:', survey);
                    return;
                }
                
                console.log('IndexedDB saveSurveys: 保存', data.stationId, '照片数:', (data.photos || []).length);
                
                var request = store.put(data);
                request.onsuccess = function() {
                    count++;
                };
                request.onerror = function(event) {
                    console.error('IndexedDB saveSurveys: 保存失败', data.stationId, event.target.error);
                };
            });
            
            transaction.oncomplete = function() {
                console.log('批量保存调查记录完成:', count, '/', surveyList.length, '条');
                resolve(true);
            };
            
            transaction.onerror = function(event) {
                console.error('批量保存调查记录失败:', event.target.error);
                reject(event.target.error);
            };
        });
    }
    
    // 获取所有调查记录
    async function getAllSurveys() {
        var surveys = await getAll('surveys');
        var result = {};
        var photoCount = 0;
        surveys.forEach(function(s) {
            if (s.stationId) {
                result[s.stationId] = s;
                if (s.photos && s.photos.length > 0) {
                    photoCount += s.photos.length;
                }
            } else {
                console.warn('IndexedDB getAllSurveys: 调查记录缺少 stationId:', s);
            }
        });
        console.log('IndexedDB getAllSurveys: 获取到', surveys.length, '条记录,', Object.keys(result).length, '条有效,', photoCount, '张照片');
        return result;
    }
    
    // 获取单条调查记录
    async function getSurvey(stationId) {
        await init();
        return new Promise(function(resolve, reject) {
            if (!db) {
                reject(new Error('IndexedDB 未初始化'));
                return;
            }
            
            var transaction = db.transaction(['surveys'], 'readonly');
            var store = transaction.objectStore('surveys');
            var request = store.get(stationId);
            
            request.onsuccess = function(event) {
                resolve(event.target.result || null);
            };
            
            request.onerror = function(event) {
                reject(event.target.error);
            };
        });
    }
    
    // 保存照片
    async function savePhoto(stationId, photoData) {
        await init();
        var photo = {
            stationId: stationId,
            data: photoData,
            createTime: new Date().toISOString()
        };
        return await set('photos', null, photo);
    }
    
    // 获取照片
    async function getPhotosByStation(stationId) {
        await init();
        var allPhotos = await getAll('photos');
        return allPhotos.filter(function(p) { return p.stationId === stationId; });
    }
    
    // 检查是否可用
    function isAvailable() {
        return 'indexedDB' in window;
    }
    
    // 获取存储统计
    async function getStats() {
        try {
            var stations = await getAllStations();
            var surveys = await getAllSurveys();
            return {
                stations: stations.length,
                surveys: Object.keys(surveys).length
            };
        } catch(e) {
            return { stations: 0, surveys: 0 };
        }
    }
    
    // 清空所有数据
    async function clearAll() {
        await init();
        await clear('stations');
        await clear('surveys');
        await clear('drafts');
        await clear('photos');
        console.log('IndexedDB 已清空');
        return true;
    }
    
    return {
        init: init,
        set: set,
        get: get,
        getAll: getAll,
        remove: remove,
        clear: clear,
        saveStations: saveStations,
        getAllStations: getAllStations,
        saveSurveys: saveSurveys,
        getAllSurveys: getAllSurveys,
        getSurvey: getSurvey,
        savePhoto: savePhoto,
        getPhotosByStation: getPhotosByStation,
        isAvailable: isAvailable,
        getStats: getStats,
        clearAll: clearAll
    };
})();
