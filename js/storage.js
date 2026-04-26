/**
 * storage.js - 本地数据存储管理
 * 使用 localStorage 模拟，5+App 中使用 plus.storage
 */

var Storage = (function() {
    // 检测运行环境
    var isPlus = typeof plus !== 'undefined';
    
    // 获取存储引擎
    function getEngine() {
        if (isPlus) {
            return {
                getItem: function(k) { return plus.storage.getItem(k); },
                setItem: function(k, v) { plus.storage.setItem(k, v); },
                removeItem: function(k) { plus.storage.removeItem(k); },
                clear: function() { plus.storage.clear(); }
            };
        }
        return localStorage;
    }

    function get(key) {
        try {
            var v = getEngine().getItem(key);
            return v ? JSON.parse(v) : null;
        } catch(e) {
            return null;
        }
    }

    function set(key, val) {
        try {
            getEngine().setItem(key, JSON.stringify(val));
            return true;
        } catch(e) {
            console.error('Storage set error:', e);
            return false;
        }
    }

    function remove(key) {
        getEngine().removeItem(key);
    }

    // ===== 站点相关 =====
    function getCentralStations() {
        return get('central_stations') || [];
    }

    function saveCentralStations(list) {
        return set('central_stations', list);
    }

    function getDispersedStations() {
        return get('dispersed_stations') || [];
    }

    function saveDispersedStations(list) {
        return set('dispersed_stations', list);
    }

    // 新增/更新集中式站点
    function upsertCentral(station) {
        var list = getCentralStations();
        if (!station.id) {
            station.id = 'C' + Date.now() + Math.random().toString(36).slice(2, 6);
            station.createTime = new Date().toISOString();
            list.push(station);
        } else {
            var idx = list.findIndex(function(s){ return s.id === station.id; });
            if (idx >= 0) list[idx] = station;
            else list.push(station);
        }
        saveCentralStations(list);
        return station;
    }

    // 新增/更新分散式站点
    function upsertDispersed(station) {
        var list = getDispersedStations();
        if (!station.id) {
            station.id = 'D' + Date.now() + Math.random().toString(36).slice(2, 6);
            station.createTime = new Date().toISOString();
            list.push(station);
        } else {
            var idx = list.findIndex(function(s){ return s.id === station.id; });
            if (idx >= 0) list[idx] = station;
            else list.push(station);
        }
        saveDispersedStations(list);
        return station;
    }

    // 删除集中式
    function deleteCentral(id) {
        var list = getCentralStations().filter(function(s){ return s.id !== id; });
        saveCentralStations(list);
    }

    // 删除分散式
    function deleteDispersed(id) {
        var list = getDispersedStations().filter(function(s){ return s.id !== id; });
        saveDispersedStations(list);
    }

    // ===== 调查记录 =====
    function getSurveys() {
        return get('surveys') || {};
    }

    function saveSurvey(stationId, surveyData) {
        var surveys = getSurveys();
        surveyData.stationId = stationId;
        surveyData.updateTime = new Date().toISOString();
        surveys[stationId] = surveyData;
        set('surveys', surveys);
    }

    function getSurvey(stationId) {
        var surveys = getSurveys();
        return surveys[stationId] || null;
    }

    function deleteSurvey(stationId) {
        var surveys = getSurveys();
        delete surveys[stationId];
        set('surveys', surveys);
    }

    // ===== 进行中的调查（临时保存）=====
    function getDraftSurveys() {
        return get('draft_surveys') || {};
    }

    function saveDraftSurvey(stationId, surveyData) {
        var drafts = getDraftSurveys();
        surveyData.stationId = stationId;
        surveyData.draftTime = new Date().toISOString();
        surveyData.isDraft = true;
        drafts[stationId] = surveyData;
        set('draft_surveys', drafts);
    }

    function getDraftSurvey(stationId) {
        var drafts = getDraftSurveys();
        return drafts[stationId] || null;
    }

    function deleteDraftSurvey(stationId) {
        var drafts = getDraftSurveys();
        delete drafts[stationId];
        set('draft_surveys', drafts);
    }

    // ===== 最近记录 =====
    function addRecentRecord(record) {
        var recent = get('recent_records') || [];
        // 去重
        recent = recent.filter(function(r){ return r.stationId !== record.stationId; });
        recent.unshift(record);
        if (recent.length > 20) recent = recent.slice(0, 20);
        set('recent_records', recent);
    }

    function getRecentRecords() {
        return get('recent_records') || [];
    }

    // ===== 问题台账 =====
    function getProblems() {
        return get('problems') || [];
    }

    function saveProblems(list) {
        set('problems', list);
    }

    // ===== 统计 =====
    function getStats() {
        var central = getCentralStations();
        var dispersed = getDispersedStations();
        var surveys = getSurveys();
        var surveyCount = Object.keys(surveys).length;
        return {
            total: central.length + dispersed.length,
            central: central.length,
            dispersed: dispersed.length,
            surveyed: surveyCount
        };
    }

    return {
        get: get,
        set: set,
        remove: remove,
        getCentralStations: getCentralStations,
        saveCentralStations: saveCentralStations,
        getDispersedStations: getDispersedStations,
        saveDispersedStations: saveDispersedStations,
        upsertCentral: upsertCentral,
        upsertDispersed: upsertDispersed,
        deleteCentral: deleteCentral,
        deleteDispersed: deleteDispersed,
        getSurveys: getSurveys,
        saveSurvey: saveSurvey,
        getSurvey: getSurvey,
        deleteSurvey: deleteSurvey,
        getDraftSurveys: getDraftSurveys,
        saveDraftSurvey: saveDraftSurvey,
        getDraftSurvey: getDraftSurvey,
        deleteDraftSurvey: deleteDraftSurvey,
        addRecentRecord: addRecentRecord,
        getRecentRecords: getRecentRecords,
        getProblems: getProblems,
        saveProblems: saveProblems,
        getStats: getStats
    };
})();
