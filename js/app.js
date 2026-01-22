// グローバル変数
let html5QrCode;
const STORAGE_KEY = 'attendance_records';
const EMPLOYEES_KEY = 'employees';
const QR_CODE_VALUE = 'ATTENDANCE_SYSTEM';

let selectedEmployeeId = null;

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', () => {
    initQRScanner();
    loadAndDisplayHistory();
    updateCurrentStatus();
    updateTodayWorkTime();
    initEmployeeModal();

    // 履歴クリアボタンのイベントリスナー
    document.getElementById('clearHistory').addEventListener('click', clearHistory);
});

// 従業員モーダルの初期化
function initEmployeeModal() {
    const modal = document.getElementById('employeeModal');
    const employeeInput = document.getElementById('employeeIdInput');
    const confirmBtn = document.getElementById('confirmBtn');
    const cancelBtn = document.getElementById('cancelBtn');

    // 従業員ID入力時の処理
    employeeInput.addEventListener('input', (e) => {
        const value = e.target.value.trim();
        if (value) {
            selectedEmployeeId = value;
            updateEmployeeList(value);
            confirmBtn.disabled = false;
        } else {
            selectedEmployeeId = null;
            confirmBtn.disabled = true;
        }
    });

    // Enterキーで確定
    employeeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && selectedEmployeeId) {
            confirmAttendance();
        }
    });

    // 確定ボタン
    confirmBtn.addEventListener('click', confirmAttendance);

    // キャンセルボタン
    cancelBtn.addEventListener('click', () => {
        closeEmployeeModal();
        // スキャンを再開
        setTimeout(() => {
            if (html5QrCode) {
                html5QrCode.resume();
            }
        }, 500);
    });
}

// 従業員選択モーダルを表示
function showEmployeeModal() {
    const modal = document.getElementById('employeeModal');
    const employeeInput = document.getElementById('employeeIdInput');
    const confirmBtn = document.getElementById('confirmBtn');

    modal.classList.add('show');
    employeeInput.value = '';
    employeeInput.focus();
    selectedEmployeeId = null;
    confirmBtn.disabled = true;

    // 既存の従業員リストを表示
    displayEmployeeList();
}

// 従業員選択モーダルを閉じる
function closeEmployeeModal() {
    const modal = document.getElementById('employeeModal');
    modal.classList.remove('show');
}

// 従業員リストを表示
function displayEmployeeList() {
    const employees = getEmployees();
    const employeeListDiv = document.getElementById('employeeList');

    if (employees.length === 0) {
        employeeListDiv.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">従業員が登録されていません</p>';
        return;
    }

    let html = '';
    employees.forEach(emp => {
        html += `<div class="employee-item" onclick="selectEmployee('${emp.id}')">`;
        html += `<div class="employee-id">${emp.id}</div>`;
        if (emp.name) {
            html += `<div class="employee-name">${emp.name}</div>`;
        }
        html += '</div>';
    });

    employeeListDiv.innerHTML = html;
}

// 従業員リストを更新（検索）
function updateEmployeeList(searchTerm) {
    const employees = getEmployees();
    const employeeListDiv = document.getElementById('employeeList');

    const filtered = employees.filter(emp =>
        emp.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (emp.name && emp.name.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    if (filtered.length === 0) {
        employeeListDiv.innerHTML = `<p style="text-align: center; color: #999; padding: 20px;">「${searchTerm}」で新規登録します</p>`;
        return;
    }

    let html = '';
    filtered.forEach(emp => {
        html += `<div class="employee-item" onclick="selectEmployee('${emp.id}')">`;
        html += `<div class="employee-id">${emp.id}</div>`;
        if (emp.name) {
            html += `<div class="employee-name">${emp.name}</div>`;
        }
        html += '</div>';
    });

    employeeListDiv.innerHTML = html;
}

// 従業員を選択
function selectEmployee(employeeId) {
    selectedEmployeeId = employeeId;
    document.getElementById('employeeIdInput').value = employeeId;
    document.getElementById('confirmBtn').disabled = false;

    // 選択状態を表示
    const items = document.querySelectorAll('.employee-item');
    items.forEach(item => {
        item.classList.remove('selected');
        if (item.querySelector('.employee-id').textContent === employeeId) {
            item.classList.add('selected');
        }
    });
}

// 出退勤を確定
function confirmAttendance() {
    if (!selectedEmployeeId) return;

    // 従業員を保存（新規の場合）
    saveEmployee(selectedEmployeeId);

    // 出退勤を記録
    recordAttendance(selectedEmployeeId);

    // モーダルを閉じる
    closeEmployeeModal();

    // スキャンを再開
    setTimeout(() => {
        if (html5QrCode) {
            html5QrCode.resume();
        }
    }, 3000);
}

// QRスキャナーの初期化
function initQRScanner() {
    html5QrCode = new Html5Qrcode("reader");

    const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 }
    };

    html5QrCode.start(
        { facingMode: "environment" },
        config,
        onScanSuccess,
        onScanError
    ).catch(err => {
        console.error('QRコードスキャナーの起動に失敗しました:', err);
        showScanResult('カメラの起動に失敗しました。カメラへのアクセスを許可してください。', false);
    });
}

// QRコード読み取り成功時の処理
function onScanSuccess(decodedText, decodedResult) {
    console.log(`QRコード読み取り成功: ${decodedText}`);

    // 固定のQRコードかチェック
    if (decodedText !== QR_CODE_VALUE) {
        showScanResult('無効なQRコードです', false);
        return;
    }

    // 同じQRコードを連続で読まないように一時停止
    html5QrCode.pause(true);

    // 従業員選択モーダルを表示
    showEmployeeModal();
}

// QRコード読み取りエラー時の処理
function onScanError(errorMessage) {
    // エラーは頻繁に発生するため、コンソールには出力しない
}

// 出退勤を記録
function recordAttendance(employeeId) {
    const now = new Date();
    const records = getRecords();

    // 今日のこの従業員の最新レコードを取得
    const todayRecords = getTodayRecordsByEmployee(records, employeeId);
    const latestRecord = todayRecords.length > 0 ? todayRecords[todayRecords.length - 1] : null;

    // 出勤か退勤かを判定
    if (!latestRecord || latestRecord.checkOut) {
        // 出勤を記録
        const newRecord = {
            id: Date.now(),
            employeeId: employeeId,
            checkIn: now.toISOString(),
            checkOut: null,
            workTime: null,
            date: formatDate(now)
        };
        records.push(newRecord);
        saveRecords(records);
        showScanResult(`${employeeId}: 出勤を記録しました (${formatTime(now)})`, true);
    } else {
        // 退勤を記録
        latestRecord.checkOut = now.toISOString();
        const checkInTime = new Date(latestRecord.checkIn);
        const workMinutes = Math.floor((now - checkInTime) / 1000 / 60);
        latestRecord.workTime = workMinutes;
        saveRecords(records);
        showScanResult(`${employeeId}: 退勤を記録しました (${formatTime(now)}) - 勤務時間: ${formatWorkTime(workMinutes)}`, true);
    }

    // 表示を更新
    loadAndDisplayHistory();
    updateCurrentStatus();
    updateTodayWorkTime();
}

// スキャン結果を表示
function showScanResult(message, isSuccess) {
    const resultDiv = document.getElementById('scanResult');
    resultDiv.textContent = message;
    resultDiv.className = 'scan-result ' + (isSuccess ? 'success' : 'error');

    // 5秒後に結果を消去
    setTimeout(() => {
        resultDiv.textContent = '';
        resultDiv.className = 'scan-result';
    }, 5000);
}

// 現在のステータスを更新（全従業員の出勤状況を表示）
function updateCurrentStatus() {
    const records = getRecords();
    const todayRecords = getTodayRecords(records);

    const statusEmployee = document.getElementById('statusEmployee');
    const statusText = document.getElementById('statusText');
    const statusTime = document.getElementById('statusTime');

    if (todayRecords.length === 0) {
        statusEmployee.textContent = '';
        statusText.textContent = '本日の打刻なし';
        statusTime.textContent = '';
        return;
    }

    // 出勤中の従業員を集計
    const workingEmployees = todayRecords.filter(record => !record.checkOut);
    const finishedEmployees = todayRecords.filter(record => record.checkOut);

    if (workingEmployees.length > 0) {
        statusText.textContent = `出勤中: ${workingEmployees.length}名`;
        const empIds = workingEmployees.map(r => r.employeeId).join(', ');
        statusEmployee.textContent = empIds;
        statusTime.textContent = `退勤済み: ${finishedEmployees.length}名`;
    } else {
        statusText.textContent = '全員退勤済み';
        statusEmployee.textContent = `本日の出勤: ${finishedEmployees.length}名`;
        statusTime.textContent = '';
    }
}

// 本日の勤務時間を更新（全従業員の合計）
function updateTodayWorkTime() {
    const records = getRecords();
    const todayRecords = getTodayRecords(records);

    let totalMinutes = 0;
    todayRecords.forEach(record => {
        if (record.checkOut) {
            totalMinutes += record.workTime;
        } else {
            // 出勤中の場合は現在時刻までの時間を計算
            const checkInTime = new Date(record.checkIn);
            const now = new Date();
            const minutes = Math.floor((now - checkInTime) / 1000 / 60);
            totalMinutes += minutes;
        }
    });

    const workTimeDiv = document.getElementById('todayWorkTime');
    workTimeDiv.textContent = formatWorkTime(totalMinutes);

    // 1分ごとに更新（出勤中の場合）
    const hasActiveRecord = todayRecords.some(record => !record.checkOut);
    if (hasActiveRecord) {
        setTimeout(updateTodayWorkTime, 60000);
    }
}

// 履歴を読み込んで表示
function loadAndDisplayHistory() {
    const records = getRecords();
    const historyList = document.getElementById('historyList');

    if (records.length === 0) {
        historyList.innerHTML = '<p class="no-data">データがありません</p>';
        return;
    }

    // 日付ごとにグループ化
    const recordsByDate = {};
    records.forEach(record => {
        if (!recordsByDate[record.date]) {
            recordsByDate[record.date] = [];
        }
        recordsByDate[record.date].push(record);
    });

    // 日付の降順でソート
    const sortedDates = Object.keys(recordsByDate).sort((a, b) => {
        return new Date(b) - new Date(a);
    });

    // HTMLを生成
    let html = '';
    sortedDates.forEach(date => {
        const dayRecords = recordsByDate[date];
        let totalMinutes = 0;

        dayRecords.forEach(record => {
            if (record.workTime) {
                totalMinutes += record.workTime;
            }
        });

        html += '<div class="history-item">';
        html += `<div class="history-date">${date}</div>`;

        dayRecords.forEach(record => {
            const checkInTime = record.checkIn ? formatTime(new Date(record.checkIn)) : '--:--';
            const checkOutTime = record.checkOut ? formatTime(new Date(record.checkOut)) : '勤務中';
            const workTime = record.workTime ? formatWorkTime(record.workTime) : '勤務中';

            html += `<div class="history-employee">従業員ID: ${record.employeeId}</div>`;
            html += '<div class="history-details">';
            html += '<div class="history-detail">';
            html += '<span class="history-label">出勤</span>';
            html += `<span class="history-value">${checkInTime}</span>`;
            html += '</div>';
            html += '<div class="history-detail">';
            html += '<span class="history-label">退勤</span>';
            html += `<span class="history-value">${checkOutTime}</span>`;
            html += '</div>';
            html += '<div class="history-detail">';
            html += '<span class="history-label">勤務時間</span>';
            html += `<span class="history-value work-time">${workTime}</span>`;
            html += '</div>';
            html += '</div>';
        });

        if (totalMinutes > 0) {
            html += '<div class="history-details" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee;">';
            html += '<div class="history-detail">';
            html += '<span class="history-label">合計勤務時間</span>';
            html += `<span class="history-value work-time">${formatWorkTime(totalMinutes)}</span>`;
            html += '</div>';
            html += '</div>';
        }

        html += '</div>';
    });

    historyList.innerHTML = html;
}

// 履歴をクリア
function clearHistory() {
    if (confirm('本当に履歴をすべて削除しますか?')) {
        localStorage.removeItem(STORAGE_KEY);
        loadAndDisplayHistory();
        updateCurrentStatus();
        updateTodayWorkTime();
        showScanResult('履歴を削除しました', true);
    }
}

// 従業員を保存
function saveEmployee(employeeId, employeeName = null) {
    const employees = getEmployees();

    // 既存の従業員かチェック
    const existing = employees.find(emp => emp.id === employeeId);
    if (existing) {
        return;
    }

    // 新規従業員を追加
    employees.push({
        id: employeeId,
        name: employeeName,
        createdAt: new Date().toISOString()
    });

    localStorage.setItem(EMPLOYEES_KEY, JSON.stringify(employees));
}

// 従業員リストを取得
function getEmployees() {
    const data = localStorage.getItem(EMPLOYEES_KEY);
    return data ? JSON.parse(data) : [];
}

// レコードを取得
function getRecords() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
}

// レコードを保存
function saveRecords(records) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

// 今日のレコードを取得
function getTodayRecords(records) {
    const today = formatDate(new Date());
    return records.filter(record => record.date === today);
}

// 今日の特定従業員のレコードを取得
function getTodayRecordsByEmployee(records, employeeId) {
    const today = formatDate(new Date());
    return records.filter(record => record.date === today && record.employeeId === employeeId);
}

// 日付をフォーマット (YYYY-MM-DD)
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekday = weekdays[date.getDay()];
    return `${year}-${month}-${day} (${weekday})`;
}

// 時刻をフォーマット (HH:MM)
function formatTime(date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// 勤務時間をフォーマット (HH:MM)
function formatWorkTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}時間${String(mins).padStart(2, '0')}分`;
}
