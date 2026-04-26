/**
 * export.js - 调查单 Word 导出
 * 使用 docx.js 生成符合《黑龙江省农村供水工程调查表》格式的 Word 文档
 */

var ExportManager = (function() {
    // 动态加载 docx.js
    var _docxLoaded = false;
    var _docxCbs = [];
    
    function loadDocxLib(cb) {
        if (_docxLoaded && typeof docx !== 'undefined') { cb(); return; }
        _docxCbs.push(cb);
        if (_docxCbs.length > 1) return;
        
        var script = document.createElement('script');
        script.src = 'js/lib/docx.min.js';
        script.onload = function() {
            _docxLoaded = true;
            _docxCbs.forEach(function(fn){ fn(); });
            _docxCbs = [];
        };
        script.onerror = function() {
            // 降级：导出为HTML格式
            _docxCbs.forEach(function(fn){ fn(); });
            _docxCbs = [];
        };
        document.head.appendChild(script);
    }

    // 导出调查表为 Word
    function exportSurveyWord(stationId, type) {
        var station = null;
        var list = type === 'central' ? Storage.getCentralStations() : Storage.getDispersedStations();
        list.forEach(function(s) { if (s.id === stationId) station = s; });
        
        var surveyData = Storage.getSurvey(stationId) || {};
        
        if (!station && !surveyData) {
            Utils.showToast('未找到站点数据');
            return;
        }
        
        Utils.showToast('正在生成Word文档...', 3000);
        
        loadDocxLib(function() {
            if (typeof docx !== 'undefined') {
                generateDocxFile(station, surveyData);
            } else {
                // 降级：生成HTML版本并下载
                generateHtmlReport(station, surveyData);
            }
        });
    }

    // 生成 docx 文件
    function generateDocxFile(station, survey) {
        try {
            var D = docx;
            
            var title = [
                new D.Paragraph({
                    children: [new D.TextRun({
                        text: '黑龙江省农村供水工程调查表',
                        bold: true,
                        size: 36,
                        font: '方正小标宋简体'
                    })],
                    alignment: D.AlignmentType.CENTER,
                    spacing: { before: 240, after: 120 }
                })
            ];

            var info = station || {};
            var s = survey || {};
            
            // 地点行
            var locationPara = new D.Paragraph({
                children: [
                    new D.TextRun({ text: '地    点：', font: '楷体', size: 21 }),
                    new D.TextRun({ text: (s.county || info.county || '') + '县（市、区）  ', underline: {}, font: '楷体', size: 21 }),
                    new D.TextRun({ text: (s.town || info.town || '') + '乡（镇）  ', underline: {}, font: '楷体', size: 21 }),
                    new D.TextRun({ text: (s.village || info.village || '') + '村  ', underline: {}, font: '楷体', size: 21 }),
                    new D.TextRun({ text: (s.hamlet || info.hamlet || '') + '屯  ', underline: {}, font: '楷体', size: 21 }),
                    new D.TextRun({ text: (s.projectName || info.name || '') + ' 供水工程', underline: {}, font: '楷体', size: 21 }),
                ]
            });

            // 构建调查表主体表格
            var tableRows = [];
            
            // 辅助函数：构建表格行
            function makeRow(label, content, highlight) {
                var labelCell = new D.TableCell({
                    children: [new D.Paragraph({
                        children: [new D.TextRun({ text: label, bold: true, size: 20, font: '宋体' })],
                        alignment: D.AlignmentType.CENTER
                    })],
                    width: { size: 1200, type: D.WidthType.DXA },
                    shading: highlight ? { fill: 'F5F5F5', type: D.ShadingType.CLEAR } : undefined,
                    margins: { top: 60, bottom: 60, left: 80, right: 80 },
                    verticalAlign: D.VerticalAlign.CENTER
                });
                
                var contentCell = new D.TableCell({
                    children: content,
                    width: { size: 8740, type: D.WidthType.DXA },
                    margins: { top: 60, bottom: 60, left: 100, right: 100 }
                });
                
                return new D.TableRow({ children: [labelCell, contentCell] });
            }

            function textPara(text) {
                return new D.Paragraph({
                    children: [new D.TextRun({ text: text || '', size: 20, font: '宋体' })]
                });
            }

            function checkPara(label, checked, extraText) {
                return new D.Paragraph({
                    children: [
                        new D.TextRun({ text: checked ? '☑' : '□', size: 20 }),
                        new D.TextRun({ text: ' ' + label + (extraText ? '  ' + extraText : ''), size: 20, font: '宋体' })
                    ]
                });
            }

            // 水质行
            var waterQuality = s.waterQuality || '';
            var waterQualityRows = [
                checkPara('符合要求', waterQuality === '符合要求', '饮用水中无肉眼可见杂质、无异色异味、用水户长期饮用无不良反应。'),
                checkPara('不符合要求', waterQuality === '不符合要求', '')
            ];
            var probs = s.waterQualityProb || [];
            ['有肉眼可见杂质','水质浑浊','水有异色','水有异味','长期饮用有不良反应'].forEach(function(p) {
                waterQualityRows.push(checkPara(p, probs.indexOf(p) >= 0, ''));
            });
            tableRows.push(makeRow('水质', waterQualityRows));
            
            // 水量行
            var wq = s.waterQuantity || '';
            var sm = s.supplyMode || '';
            tableRows.push(makeRow('水量', [
                checkPara('符合要求', wq === '符合要求', ''),
                checkPara('不符合要求', wq === '不符合要求', s.waterQuantityDesc || ''),
                checkPara('24小时连续供水', sm === '24小时连续供水', ''),
                checkPara('定时供水', sm === '定时供水', (s.supplyTimesPerDay || '') + '次/日、' + (s.supplyHoursPerTime || '') + '小时/次')
            ]));
            
            // 方便程度
            var conv = s.convenience || '';
            tableRows.push(makeRow('用水方便程度', [
                checkPara('达标', conv.indexOf('达标') === 0 && conv.indexOf('基本') < 0, '集中式供水工程或分散式供水工程供水入户的用水户；人力取水往返时间不超过10min或水平距离≤400m、垂直距离≤40m。'),
                checkPara('基本达标', conv.indexOf('基本达标') >= 0, '人力取水往返时间不超过20min或水平距离≤800m、垂直距离≤80m。'),
                checkPara('不达标', conv.indexOf('不达标') >= 0, s.convenienceDesc || '')
            ]));
            
            // 供水保证率
            var sg = s.supplyGuarantee || '';
            tableRows.push(makeRow('供水保证率', [
                checkPara('达标', sg.indexOf('达标') === 0 && sg.indexOf('基本') < 0, '一年中水量不足的天数低于18天。'),
                checkPara('基本达标', sg.indexOf('基本达标') >= 0, '一年中水量不足的天数低于36天。'),
                checkPara('不达标', sg.indexOf('不达标') >= 0, s.supplyGuaranteeDesc || '')
            ]));
            
            // 水费收缴
            var fc = s.feeCollected || '';
            tableRows.push(makeRow('水费收缴及补贴机制', [
                checkPara('收取水费', fc === '收取水费', 
                    '水费标准：' + (s.feePerTon || '__') + '元/吨，' + (s.feePerHousehold || '__') + '元/户/年；' + (s.feePerPerson || '__') + '元/人/年。'),
                checkPara('未收取水费', fc === '未收取水费', '运行维护费用由' + (s.feeBearer || '') + '承担。'),
                checkPara('大牲畜养殖缴费', s.livestockFee === '缴费', (s.livestockFeeAmount || '') + '元/头/年'),
                checkPara('大牲畜不缴费', s.livestockFee === '不缴费', ''),
                checkPara('具有补贴机制', s.subsidyMechanism === '具有补贴机制', ''),
                checkPara('不具有补贴机制', s.subsidyMechanism === '不具有补贴机制', '')
            ]));
            
            // 供水情况
            tableRows.push(makeRow('供水情况', [
                checkPara('24小时供水', sm === '24小时连续供水', ''),
                checkPara('定时供水', sm === '定时供水', (s.supplyTimesPerDay || '__') + '次/日、' + (s.supplyHoursPerTime || '__') + '小时/次')
            ]));
            
            // 工程管理
            var ps = s.projectStatus || '';
            var mgProbs = s.managementProb || [];
            var mgRows = [
                checkPara('稳定水源', s.stableSource === '是', ''),
                checkPara('无稳定水源', s.stableSource === '否', ''),
                checkPara('运行管护良好', ps === '运行管护良好', '水源周边无污染源，设置围栏、保护标识及明白卡，井室内部管理制度上墙、整洁无杂物。'),
                checkPara('处于失管状态', ps === '处于失管状态', '')
            ];
            ['无人期间未上锁','水源周边存在污染源','未设置围栏','未设置水源标识','未设置管理制度','未设置明白卡','明白卡内容不全面','井室内部有杂物不整洁'].forEach(function(p) {
                mgRows.push(checkPara(p, mgProbs.indexOf(p) >= 0, ''));
            });
            if (s.pollutionSource) mgRows.push(textPara('污染源：' + s.pollutionSource));
            mgRows.push(checkPara('水质检测报告：有', s.qualityReport === '有', ''));
            mgRows.push(checkPara('水质检测报告：无', s.qualityReport === '无', ''));
            mgRows.push(checkPara('水处理设备：有', s.treatmentEquip === '有', ''));
            mgRows.push(checkPara('水处理设备：无', s.treatmentEquip === '无', ''));
            mgRows.push(checkPara('消毒设备：有', s.disinfectEquip === '有', ''));
            mgRows.push(checkPara('消毒设备：无', s.disinfectEquip === '无', ''));
            tableRows.push(makeRow('供水工程', mgRows));
            
            // 维修服务
            tableRows.push(makeRow('维修服务', [
                checkPara('维修服务信息：有', s.repairInfo === '有', ''),
                checkPara('维修服务信息：无', s.repairInfo === '无', ''),
                checkPara('维修服务时限：及时', s.repairTimeliness === '及时', ''),
                checkPara('维修服务时限：不及时', s.repairTimeliness === '不及时', ''),
                checkPara('水管员健康证：有', s.managerHealthCert === '有', ''),
                checkPara('水管员健康证：无', s.managerHealthCert === '无', '')
            ]));
            
            // 管理情况
            tableRows.push(makeRow('管理情况', [
                checkPara('资金管理：有', s.fundManagement === '有', ''),
                checkPara('资金管理：无', s.fundManagement === '无', ''),
                checkPara('县域统管：有', s.countyManagement === '有', ''),
                checkPara('县域统管：无', s.countyManagement === '无', ''),
                textPara('问题类型：' + (s.problemType || ''))
            ]));
            
            // 群众满意度
            var households = s.households || [];
            var satisfyRows = [];
            households.forEach(function(h, i) {
                if (!h || !h.name) return;
                satisfyRows.push(textPara(
                    '农户姓名：' + (h.name || '') + '；' +
                    (h.isPoor ? '脱贫人口' : '') + '；' +
                    (h.satisfied === '满意' ? '☑满意 □不满意' : '□满意 ☑不满意') + '；' +
                    '意见建议：' + (h.suggestion || '')
                ));
            });
            if (!satisfyRows.length) satisfyRows.push(textPara('暂无'));
            tableRows.push(makeRow('群众满意度及参与', satisfyRows));
            
            // 建议及问题
            tableRows.push(makeRow('建议及问题', [
                textPara(s.problemSummary || ''),
                textPara(s.suggestions || ''),
                new D.Paragraph({
                    children: [
                        new D.TextRun({ text: '时    间：', size: 20, font: '楷体' }),
                        new D.TextRun({ text: formatDocDate(s.finalDate || s.surveyDate || ''), underline: {}, size: 20, font: '楷体' }),
                        new D.TextRun({ text: '    调查人员：', size: 20, font: '楷体' }),
                        new D.TextRun({ text: (s.investigators || s.investigator || ''), underline: {}, size: 20, font: '楷体' })
                    ]
                })
            ]));

            // 创建表格
            var mainTable = new D.Table({
                width: { size: 9940, type: D.WidthType.DXA },
                columnWidths: [1200, 8740],
                rows: tableRows,
                borders: {
                    top: { style: D.BorderStyle.SINGLE, size: 4, color: '000000' },
                    bottom: { style: D.BorderStyle.SINGLE, size: 4, color: '000000' },
                    left: { style: D.BorderStyle.SINGLE, size: 4, color: '000000' },
                    right: { style: D.BorderStyle.SINGLE, size: 4, color: '000000' },
                    insideH: { style: D.BorderStyle.SINGLE, size: 4, color: '000000' },
                    insideV: { style: D.BorderStyle.SINGLE, size: 4, color: '000000' }
                }
            });
            
            var doc = new D.Document({
                sections: [{
                    properties: {
                        page: {
                            size: { width: 11906, height: 16838 },
                            margin: { top: 1134, right: 850, bottom: 1134, left: 1701 }
                        }
                    },
                    children: title.concat([locationPara, mainTable])
                }]
            });
            
            D.Packer.toBlob(doc).then(function(blob) {
                var filename = (s.county || '') + (s.town || '') + (station ? station.name : '') + '调查表.docx';
                downloadBlob(blob, filename);
                Utils.showToast('调查表已导出');
            }).catch(function(e) {
                console.error('docx生成失败:', e);
                generateHtmlReport(station, survey);
            });

        } catch(e) {
            console.error('生成Word失败，降级为HTML:', e);
            generateHtmlReport(station, survey);
        }
    }

    // 降级：生成HTML格式报告
    function generateHtmlReport(station, survey) {
        var s = survey || {};
        var info = station || {};
        
        var checkMark = function(label, checked, extra) {
            return '<tr><td style="padding:4px 8px;font-size:12px;">' + 
                   (checked ? '☑' : '□') + ' ' + label + (extra ? '  ' + extra : '') + '</td></tr>';
        };
        
        var html = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
            '<title>农村供水工程调查表</title>' +
            '<style>body{font-family:"宋体",serif;font-size:13px;padding:20px;max-width:800px;margin:0 auto;}' +
            'h1{text-align:center;font-size:18px;font-family:"方正小标宋简体","黑体";}' +
            '.loc{margin:10px 0;font-size:13px;font-family:"楷体";}' +
            'table{border-collapse:collapse;width:100%;}' +
            'td,th{border:1px solid #000;padding:6px 8px;vertical-align:top;font-size:12px;}' +
            '.label{background:#f5f5f5;font-weight:bold;width:90px;text-align:center;}</style>' +
            '</head><body>' +
            '<h1>黑龙江省农村供水工程调查表</h1>' +
            '<p class="loc">地点：' + (s.county||info.county||'') + '县（市、区）&nbsp;&nbsp;' +
            (s.town||info.town||'') + '乡（镇）&nbsp;&nbsp;' +
            (s.village||info.village||'') + '村&nbsp;&nbsp;' +
            (s.hamlet||info.hamlet||'') + '屯&nbsp;&nbsp;' +
            (s.projectName||info.name||'') + ' 供水工程</p>' +
            '<table>';
        
        // 水质
        html += '<tr><td class="label" rowspan="7">水质</td><td>' +
            (s.waterQuality === '符合要求' ? '☑' : '□') + ' 符合要求。饮用水中无肉眼可见杂质、无异色异味、用水户长期饮用无不良反应。<br>' +
            (s.waterQuality === '不符合要求' ? '☑' : '□') + ' 不符合要求。</td></tr>';
        
        var probs = s.waterQualityProb || [];
        html += '<tr><td>' + ['有肉眼可见杂质','水质浑浊','水有异色','水有异味','长期饮用有不良反应'].map(function(p) {
            return (probs.indexOf(p) >= 0 ? '☑' : '□') + ' ' + p;
        }).join('&nbsp;&nbsp;') + '</td></tr>';
        
        // 水量
        html += '<tr><td class="label" rowspan="2">水量</td><td>' +
            (s.waterQuantity === '符合要求' ? '☑' : '□') + ' 符合要求。水龙头入户正常出水且24小时连续供水。<br>' +
            (s.waterQuantity === '不符合要求' ? '☑' : '□') + ' 不符合要求。表现为：' + (s.waterQuantityDesc || '') + '</td></tr>';
        
        // 用水方便程度
        var conv = s.convenience || '';
        html += '<tr><td class="label">用水方便程度</td><td>' +
            (conv.indexOf('达标') === 0 && conv.indexOf('基本') < 0 ? '☑' : '□') + ' 达标。供水入户或取水往返≤10分钟。<br>' +
            (conv.indexOf('基本达标') >= 0 ? '☑' : '□') + ' 基本达标。取水往返≤20分钟。<br>' +
            (conv.indexOf('不达标') >= 0 ? '☑' : '□') + ' 不达标。表现为：' + (s.convenienceDesc || '') + '</td></tr>';
        
        // 供水保证率
        var sg = s.supplyGuarantee || '';
        html += '<tr><td class="label">供水保证率</td><td>' +
            (sg.indexOf('达标') === 0 && sg.indexOf('基本') < 0 ? '☑' : '□') + ' 达标。一年中水量不足天数 < 18天。<br>' +
            (sg.indexOf('基本达标') >= 0 ? '☑' : '□') + ' 基本达标。一年中水量不足天数 < 36天。<br>' +
            (sg.indexOf('不达标') >= 0 ? '☑' : '□') + ' 不达标。' + (s.supplyGuaranteeDesc || '') + '</td></tr>';
        
        // 水费
        var fc = s.feeCollected || '';
        html += '<tr><td class="label">水费收缴及补贴机制</td><td>' +
            (fc === '收取水费' ? '☑' : '□') + ' 收取水费，水费标准：' + (s.feePerTon||'__') + '元/吨，' + (s.feePerHousehold||'__') + '元/户/年；' + (s.feePerPerson||'__') + '元/人/年。<br>' +
            (fc === '未收取水费' ? '☑' : '□') + ' 未收取水费，运行维护费用由' + (s.feeBearer||'') + '承担。<br>' +
            (s.subsidyMechanism === '具有补贴机制' ? '☑' : '□') + ' 具有补贴机制&nbsp;&nbsp;' +
            (s.subsidyMechanism === '不具有补贴机制' ? '☑' : '□') + ' 不具有补贴机制。</td></tr>';
        
        // 工程管理
        var ps = s.projectStatus || '';
        var mgProbs = s.managementProb || [];
        html += '<tr><td class="label">供水工程</td><td>' +
            '稳定水源：' + (s.stableSource === '是' ? '☑是' : '□是') + '&nbsp;' + (s.stableSource === '否' ? '☑否' : '□否') + '<br>' +
            (ps === '运行管护良好' ? '☑' : '□') + ' 运行管护良好。<br>' +
            (ps === '处于失管状态' ? '☑' : '□') + ' 处于失管状态。<br>' +
            mgProbs.map(function(p){ return '☑ ' + p; }).join('；') + '<br>' +
            '水质检测报告：' + (s.qualityReport === '有' ? '☑有' : '□有') + '&nbsp;' + (s.qualityReport === '无' ? '☑无' : '□无') + '<br>' +
            '水处理设备：' + (s.treatmentEquip === '有' ? '☑有' : '□有') + '&nbsp;' + (s.treatmentEquip === '无' ? '☑无' : '□无') + '<br>' +
            '消毒设备：' + (s.disinfectEquip === '有' ? '☑有' : '□有') + '&nbsp;' + (s.disinfectEquip === '无' ? '☑无' : '□无') +
            '</td></tr>';
        
        // 维修服务
        html += '<tr><td class="label">维修服务</td><td>' +
            '维修服务信息：' + (s.repairInfo === '有' ? '☑有' : '□有') + '&nbsp;' + (s.repairInfo === '无' ? '☑无' : '□无') + '<br>' +
            '维修服务时限：' + (s.repairTimeliness === '及时' ? '☑及时' : '□及时') + '&nbsp;' + (s.repairTimeliness === '不及时' ? '☑不及时' : '□不及时') + '<br>' +
            '水管员健康证：' + (s.managerHealthCert === '有' ? '☑有' : '□有') + '&nbsp;' + (s.managerHealthCert === '无' ? '☑无' : '□无') +
            '</td></tr>';
        
        // 管理情况
        html += '<tr><td class="label">管理情况</td><td>' +
            '资金管理：' + (s.fundManagement === '有' ? '☑有' : '□有') + '&nbsp;' + (s.fundManagement === '无' ? '☑无' : '□无') + '&nbsp;&nbsp;&nbsp;&nbsp;' +
            '县域统管：' + (s.countyManagement === '有' ? '☑有' : '□有') + '&nbsp;' + (s.countyManagement === '无' ? '☑无' : '□无') + '<br>' +
            '问题类型：' + (s.problemType || '') +
            '</td></tr>';
        
        // 群众满意度
        var households = s.households || [];
        var hHtml = households.filter(function(h){ return h && h.name; }).map(function(h) {
            return '农户姓名：' + h.name + '；' + (h.isPoor ? '脱贫人口；' : '') +
                   (h.satisfied === '满意' ? '☑满意 □不满意' : '□满意 ☑不满意') + '；意见建议：' + (h.suggestion || '');
        }).join('<br>') || '暂无';
        html += '<tr><td class="label">群众满意度及参与</td><td>' + hHtml + '</td></tr>';
        
        // 建议及问题
        html += '<tr><td class="label">建议及问题</td><td>' +
            (s.problemSummary || '') + '<br>' + (s.suggestions || '') +
            '<br><br>时    间：' + formatDocDate(s.finalDate || s.surveyDate || '') +
            '&nbsp;&nbsp;&nbsp;&nbsp;调查人员：' + (s.investigators || s.investigator || '') +
            '</td></tr>';
        
        html += '</table></body></html>';
        
        var filename = (s.county||'') + (s.town||'') + (station ? station.name : '未知') + '调查表.html';
        var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        downloadBlob(blob, filename);
        Utils.showToast('已生成调查表（HTML格式）', 3000);
    }

    // ===== 导出供水工程调查完成统计表 =====
    function exportRecordTable() {
        var centralStations = Storage.getCentralStations();
        var dispersedStations = Storage.getDispersedStations();
        var surveys = Storage.getSurveys();
        
        // 合并所有站点数据，并关联调查数据
        var allStations = [];
        centralStations.forEach(function(s) {
            var survey = surveys[s.id];
            allStations.push({
                id: s.id,
                type: '集中式',
                name: s.name,
                county: s.county,
                town: s.town,
                village: s.village,
                hamlet: s.hamlet,
                stationType: s.stationType || '-',
                population: s.population,
                surveyed: !!survey,
                surveyDate: survey ? survey.surveyDate : '',
                investigator: survey ? survey.investigator : '',
                waterQuality: survey ? survey.waterQuality : '',
                waterQuantity: survey ? survey.waterQuantity : '',
                convenience: survey ? survey.convenience : '',
                supplyGuarantee: survey ? survey.supplyGuarantee : ''
            });
        });
        dispersedStations.forEach(function(s) {
            var survey = surveys[s.id];
            allStations.push({
                id: s.id,
                type: '分散式',
                name: s.name,
                county: s.county,
                town: s.town,
                village: s.village,
                hamlet: s.hamlet,
                stationType: '-',
                population: s.population,
                surveyed: !!survey,
                surveyDate: survey ? survey.surveyDate : '',
                investigator: survey ? survey.investigator : '',
                waterQuality: survey ? survey.waterQuality : '',
                waterQuantity: survey ? survey.waterQuantity : '',
                convenience: survey ? survey.convenience : '',
                supplyGuarantee: survey ? survey.supplyGuarantee : ''
            });
        });
        
        // 按地区排序
        allStations.sort(function(a, b) {
            return (a.county + a.town + a.village).localeCompare(b.county + b.town + b.village);
        });
        
        Utils.showToast('正在生成调查完成统计表...', 3000);
        
        loadDocxLib(function() {
            if (typeof docx !== 'undefined') {
                generateSurveyStatusDocx(allStations);
            } else {
                generateSurveyStatusHtml(allStations);
            }
        });
    }

    // 生成Word格式的调查完成统计表
    function generateSurveyStatusDocx(stations) {
        try {
            var D = docx;

            // 标题
            var title = new D.Paragraph({
                children: [new D.TextRun({
                    text: '绥化市农村供水工程调查完成情况统计表',
                    bold: true,
                    size: 36,
                    font: '方正小标宋简体'
                })],
                alignment: D.AlignmentType.CENTER,
                spacing: { before: 240, after: 200 }
            });

            // 统计信息
            var totalCount = stations.length;
            var surveyedCount = stations.filter(function(s) { return s.surveyed; }).length;

            var statsPara = new D.Paragraph({
                children: [
                    new D.TextRun({ text: '统计时间：', font: '楷体', size: 21 }),
                    new D.TextRun({ text: formatDocDate(new Date().toISOString()), font: '楷体', size: 21 }),
                    new D.TextRun({ text: '    站点总数：', font: '楷体', size: 21 }),
                    new D.TextRun({ text: totalCount + '个', bold: true, font: '楷体', size: 21 }),
                    new D.TextRun({ text: '    已调查：', font: '楷体', size: 21 }),
                    new D.TextRun({ text: surveyedCount + '个', bold: true, font: '楷体', size: 21 }),
                    new D.TextRun({ text: '    未调查：', font: '楷体', size: 21 }),
                    new D.TextRun({ text: (totalCount - surveyedCount) + '个', bold: true, font: '楷体', size: 21 })
                ],
                spacing: { after: 200 }
            });

            // 表格行
            var tableRows = [];

            // 表头
            tableRows.push(new D.TableRow({
                children: [
                    new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: '序号', bold: true, size: 18, font: '宋体' })], alignment: D.AlignmentType.CENTER })], width: { size: 400, type: D.WidthType.DXA } }),
                    new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: '县区', bold: true, size: 18, font: '宋体' })], alignment: D.AlignmentType.CENTER })], width: { size: 700, type: D.WidthType.DXA } }),
                    new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: '乡镇', bold: true, size: 18, font: '宋体' })], alignment: D.AlignmentType.CENTER })], width: { size: 700, type: D.WidthType.DXA } }),
                    new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: '村', bold: true, size: 18, font: '宋体' })], alignment: D.AlignmentType.CENTER })], width: { size: 700, type: D.WidthType.DXA } }),
                    new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: '屯', bold: true, size: 18, font: '宋体' })], alignment: D.AlignmentType.CENTER })], width: { size: 600, type: D.WidthType.DXA } }),
                    new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: '工程名称', bold: true, size: 18, font: '宋体' })], alignment: D.AlignmentType.CENTER })], width: { size: 1500, type: D.WidthType.DXA } }),
                    new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: '类型', bold: true, size: 18, font: '宋体' })], alignment: D.AlignmentType.CENTER })], width: { size: 600, type: D.WidthType.DXA } }),
                    new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: '调查日期', bold: true, size: 18, font: '宋体' })], alignment: D.AlignmentType.CENTER })], width: { size: 800, type: D.WidthType.DXA } }),
                    new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: '调查人员', bold: true, size: 18, font: '宋体' })], alignment: D.AlignmentType.CENTER })], width: { size: 800, type: D.WidthType.DXA } }),
                    new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: '水质', bold: true, size: 18, font: '宋体' })], alignment: D.AlignmentType.CENTER })], width: { size: 600, type: D.WidthType.DXA } }),
                    new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: '水量', bold: true, size: 18, font: '宋体' })], alignment: D.AlignmentType.CENTER })], width: { size: 600, type: D.WidthType.DXA } }),
                    new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: '方便程度', bold: true, size: 18, font: '宋体' })], alignment: D.AlignmentType.CENTER })], width: { size: 700, type: D.WidthType.DXA } }),
                    new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: '保证率', bold: true, size: 18, font: '宋体' })], alignment: D.AlignmentType.CENTER })], width: { size: 600, type: D.WidthType.DXA } }),
                    new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: '调查状态', bold: true, size: 18, font: '宋体' })], alignment: D.AlignmentType.CENTER })], width: { size: 700, type: D.WidthType.DXA } })
                ]
            }));

            // 数据行
            stations.forEach(function(s, index) {
                var wq = s.waterQuality || '';
                var wqText = wq.indexOf('符合') >= 0 ? '达标' : (wq.indexOf('不符合') >= 0 ? '不达标' : '-');

                var wqty = s.waterQuantity || '';
                var wqtyText = wqty.indexOf('符合') >= 0 ? '达标' : (wqty.indexOf('不符合') >= 0 ? '不达标' : '-');

                var conv = s.convenience || '';
                var convText = conv.indexOf('达标') >= 0 && conv.indexOf('基本') < 0 ? '达标' :
                               (conv.indexOf('基本达标') >= 0 ? '基本达标' :
                               (conv.indexOf('不达标') >= 0 ? '不达标' : '-'));

                var sg = s.supplyGuarantee || '';
                var sgText = sg.indexOf('达标') >= 0 && sg.indexOf('基本') < 0 ? '达标' :
                             (sg.indexOf('基本达标') >= 0 ? '基本达标' :
                             (sg.indexOf('不达标') >= 0 ? '不达标' : '-'));

                tableRows.push(new D.TableRow({
                    children: [
                        new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: String(index + 1), size: 16, font: '宋体' })], alignment: D.AlignmentType.CENTER })] }),
                        new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: s.county || '', size: 16, font: '宋体' })] })] }),
                        new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: s.town || '', size: 16, font: '宋体' })] })] }),
                        new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: s.village || '', size: 16, font: '宋体' })] })] }),
                        new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: s.hamlet || '', size: 16, font: '宋体' })] })] }),
                        new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: s.name || '', size: 16, font: '宋体' })] })] }),
                        new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: s.type, size: 16, font: '宋体' })], alignment: D.AlignmentType.CENTER })] }),
                        new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: s.surveyDate || '', size: 16, font: '宋体' })], alignment: D.AlignmentType.CENTER })] }),
                        new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: s.investigator || '', size: 16, font: '宋体' })] })] }),
                        new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: wqText, size: 16, font: '宋体' })], alignment: D.AlignmentType.CENTER })] }),
                        new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: wqtyText, size: 16, font: '宋体' })], alignment: D.AlignmentType.CENTER })] }),
                        new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: convText, size: 16, font: '宋体' })], alignment: D.AlignmentType.CENTER })] }),
                        new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: sgText, size: 16, font: '宋体' })], alignment: D.AlignmentType.CENTER })] }),
                        new D.TableCell({ children: [new D.Paragraph({ children: [new D.TextRun({ text: s.surveyed ? '已完成' : '未完成', size: 16, font: '宋体', color: s.surveyed ? '00AA00' : 'FF6600' })], alignment: D.AlignmentType.CENTER })] })
                    ]
                }));
            });

            // 创建表格
            var table = new D.Table({
                width: { size: 10000, type: D.WidthType.DXA },
                rows: tableRows,
                borders: {
                    top: { style: D.BorderStyle.SINGLE, size: 4, color: '000000' },
                    bottom: { style: D.BorderStyle.SINGLE, size: 4, color: '000000' },
                    left: { style: D.BorderStyle.SINGLE, size: 4, color: '000000' },
                    right: { style: D.BorderStyle.SINGLE, size: 4, color: '000000' },
                    insideH: { style: D.BorderStyle.SINGLE, size: 4, color: '000000' },
                    insideV: { style: D.BorderStyle.SINGLE, size: 4, color: '000000' }
                }
            });

            var doc = new D.Document({
                sections: [{
                    properties: {
                        page: {
                            size: { width: 16838, height: 11906, orientation: D.PageOrientation.LANDSCAPE },
                            margin: { top: 850, right: 850, bottom: 850, left: 850 }
                        }
                    },
                    children: [title, statsPara, table]
                }]
            });

            D.Packer.toBlob(doc).then(function(blob) {
                var filename = '供水工程调查完成统计表_' + formatDateForFilename() + '.docx';
                downloadBlob(blob, filename);
                Utils.showToast('调查完成统计表已导出');
            }).catch(function(e) {
                console.error('统计表生成失败:', e);
                generateSurveyStatusHtml(stations);
            });

        } catch(e) {
            console.error('生成统计表失败:', e);
            generateSurveyStatusHtml(stations);
        }
    }

    // 生成HTML格式的调查完成统计表
    function generateSurveyStatusHtml(stations) {
        var totalCount = stations.length;
        var surveyedCount = stations.filter(function(s) { return s.surveyed; }).length;

        var html = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
            '<title>供水工程调查完成统计表</title>' +
            '<style>body{font-family:"宋体",serif;font-size:13px;padding:20px;}' +
            'h1{text-align:center;font-size:20px;}' +
            '.stats{margin:15px 0;font-size:13px;}' +
            'table{border-collapse:collapse;width:100%;}' +
            'td,th{border:1px solid #000;padding:6px 8px;font-size:12px;}' +
            'th{background:#e7e6e6;font-weight:bold;text-align:center;}' +
            'td{text-align:center;}' +
            '.已完成{color:green;font-weight:bold;}.未完成{color:#ff6600;}</style>' +
            '</head><body>' +
            '<h1>绥化市农村供水工程调查完成情况统计表</h1>' +
            '<div class="stats">统计时间：' + formatDocDate(new Date().toISOString()) +
            '&nbsp;&nbsp;站点总数：<b>' + totalCount + '</b>个' +
            '&nbsp;&nbsp;已调查：<b>' + surveyedCount + '</b>个' +
            '&nbsp;&nbsp;未调查：<b>' + (totalCount - surveyedCount) + '</b>个</div>' +
            '<table>' +
            '<tr><th>序号</th><th>县区</th><th>乡镇</th><th>村</th><th>屯</th><th>工程名称</th><th>类型</th>' +
            '<th>调查日期</th><th>调查人员</th><th>水质</th><th>水量</th><th>方便程度</th><th>保证率</th><th>调查状态</th></tr>';

        stations.forEach(function(s, index) {
            var wq = s.waterQuality || '';
            var wqText = wq.indexOf('符合') >= 0 ? '达标' : (wq.indexOf('不符合') >= 0 ? '不达标' : '-');

            var wqty = s.waterQuantity || '';
            var wqtyText = wqty.indexOf('符合') >= 0 ? '达标' : (wqty.indexOf('不符合') >= 0 ? '不达标' : '-');

            var conv = s.convenience || '';
            var convText = conv.indexOf('达标') >= 0 && conv.indexOf('基本') < 0 ? '达标' :
                           (conv.indexOf('基本达标') >= 0 ? '基本达标' :
                           (conv.indexOf('不达标') >= 0 ? '不达标' : '-'));

            var sg = s.supplyGuarantee || '';
            var sgText = sg.indexOf('达标') >= 0 && sg.indexOf('基本') < 0 ? '达标' :
                         (sg.indexOf('基本达标') >= 0 ? '基本达标' :
                         (sg.indexOf('不达标') >= 0 ? '不达标' : '-'));

            html += '<tr>' +
                '<td>' + (index + 1) + '</td>' +
                '<td>' + (s.county || '') + '</td>' +
                '<td>' + (s.town || '') + '</td>' +
                '<td>' + (s.village || '') + '</td>' +
                '<td>' + (s.hamlet || '') + '</td>' +
                '<td>' + (s.name || '') + '</td>' +
                '<td>' + s.type + '</td>' +
                '<td>' + (s.surveyDate || '') + '</td>' +
                '<td>' + (s.investigator || '') + '</td>' +
                '<td>' + wqText + '</td>' +
                '<td>' + wqtyText + '</td>' +
                '<td>' + convText + '</td>' +
                '<td>' + sgText + '</td>' +
                '<td class="' + (s.surveyed ? '已完成' : '未完成') + '">' + (s.surveyed ? '已完成' : '未完成') + '</td>' +
                '</tr>';
        });

        html += '</table></body></html>';

        var filename = '供水工程调查完成统计表_' + formatDateForFilename() + '.html';
        var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        downloadBlob(blob, filename);
        Utils.showToast('已生成调查完成统计表（HTML格式）', 3000);
    }

    // 下载 Blob
    function downloadBlob(blob, filename) {
        if (typeof plus !== 'undefined' && plus.io) {
            // 5+App 保存到本地
            var reader = new FileReader();
            reader.onload = function(e) {
                var base64 = e.target.result.split(',')[1];
                var path = '_doc/' + filename;
                plus.io.resolveLocalFileSystemURL(path, function(entry) {
                    entry.remove(function() {
                        saveToDoc(base64, path, filename);
                    }, function() {
                        saveToDoc(base64, path, filename);
                    });
                }, function() {
                    saveToDoc(base64, path, filename);
                });
            };
            reader.readAsDataURL(blob);
        } else {
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
        }
    }

    function saveToDoc(base64, path, filename) {
        plus.io.resolveLocalFileSystemURL('_doc/', function(dir) {
            dir.getFile(filename, { create: true }, function(fileEntry) {
                fileEntry.createWriter(function(writer) {
                    writer.onwrite = function() {
                        Utils.showToast('文件已保存到：' + path, 3000);
                        // 打开文件
                        plus.runtime.openFile(fileEntry.toLocalURL());
                    };
                    writer.write(plus.android ? base64 : new Blob([atob(base64)]));
                });
            });
        });
    }

    function formatDocDate(dateStr) {
        if (!dateStr) return '____年__月__日';
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.getFullYear() + '年' + (d.getMonth()+1) + '月' + d.getDate() + '日';
    }
    
    function formatDateForFilename() {
        var d = new Date();
        return d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0');
    }

    return {
        exportSurveyWord: exportSurveyWord,
        exportRecordTable: exportRecordTable,
        generateHtmlReport: generateHtmlReport
    };
})();
