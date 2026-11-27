'use client';

import { useState } from 'react';
import { Alert, App, Button, Space, Table, Tag, Typography, Upload } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { InboxOutlined } from '@ant-design/icons';
import { LUCKY_TIME_COLUMNS, type LuckyTimeColumnKey, type LuckyTimeParsed } from '@toolhackchain/shared';
import { importLuckyTimes, LuckyTimeApiNotReadyError, TEMP_NO_HU_CATEGORIES } from '@/lib/api/lucky-time';

type PreviewRow = LuckyTimeParsed['preview'][number];
const KEYS = Object.keys(LUCKY_TIME_COLUMNS) as LuckyTimeColumnKey[];
// TẠM THỜI: tên game hợp lệ lấy từ danh sách category tạm; khi có API thì lấy từ GET /categories?lobby_id=NO_HU_LOBBY_ID.
const GAME_NAMES = TEMP_NO_HU_CATEGORIES.map((c) => c.name);

export function LuckyTimeImport() {
  const { message, modal } = App.useApp();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<LuckyTimeParsed | null>(null);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);

  const fileIssues = parsed?.issues.filter((i) => i.row === null || parsed.preview.length === 0) ?? [];
  const blocked = !parsed || parsed.issues.length > 0 || parsed.rows.length === 0;

  async function readFile(file: File) {
    setReading(true);
    setFileName(file.name);
    setParsed(null);
    try {
      // Tải thư viện đọc bảng tính khi cần (không đưa vào bundle trang khác).
      const { readLuckyTimeFile } = await import('@toolhackchain/shared/lucky-time-file');
      setParsed(readLuckyTimeFile(await file.arrayBuffer(), GAME_NAMES));
    } finally {
      setReading(false);
    }
  }

  function confirmImport() {
    if (!parsed || blocked) return;
    const games = [...new Set(parsed.rows.map((r) => r.data.game ?? 'Tất cả (dùng chung)'))];
    modal.confirm({
      title: `Thay thế lịch của ${games.length} game?`,
      content: `Import sẽ THAY THẾ lịch lucky time đang hiệu lực của: ${games.join(', ')} bằng ${parsed.rows.length} dòng trong file ${fileName}. Game không có trong file giữ nguyên.`,
      okText: 'Import',
      cancelText: 'Hủy',
      onOk: async () => {
        setImporting(true);
        try {
          await importLuckyTimes(parsed.rows.map((r) => r.data));
          message.success('Đã import lịch.');
        } catch (e) {
          if (e instanceof LuckyTimeApiNotReadyError) message.warning(e.message);
          else message.error('Import thất bại. Vui lòng thử lại.');
        } finally {
          setImporting(false);
        }
      },
    });
  }

  const columns: ColumnsType<PreviewRow> = [
    { title: 'Dòng', dataIndex: 'row', width: 70 },
    ...KEYS.map((k) => ({
      title: LUCKY_TIME_COLUMNS[k],
      key: k,
      render: (_: unknown, r: PreviewRow) => {
        const bad = r.issues.find((i) => i.column === LUCKY_TIME_COLUMNS[k]);
        return bad ? <Typography.Text type="danger">{r.cells[k] || '(trống)'}</Typography.Text> : r.cells[k] || '—';
      },
    })),
    {
      title: 'Kết quả',
      key: 'status',
      width: 320,
      render: (_, r) => r.issues.length === 0
        ? <Tag color="green">Hợp lệ</Tag>
        : <Space direction="vertical" size={2}>{r.issues.map((i, n) => <Typography.Text key={n} type="danger">{i.column}: {i.reason}</Typography.Text>)}</Space>,
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Alert
        type="warning"
        showIcon
        message="Import sẽ THAY THẾ lịch hiện tại của MỌI game có trong file."
        description={`Cột "Game" của mỗi dòng là tên category (${GAME_NAMES.join(', ')}) hoặc "Tất cả" (lịch dùng chung). Game không có trong file giữ nguyên. Lịch cũ không bị xóa, chỉ được đánh dấu đã thay thế.`}
      />
      <Upload.Dragger
        accept=".xlsx,.xls,.csv,.ods,.xlsm"
        maxCount={1}
        showUploadList={false}
        beforeUpload={(file) => {
          void readFile(file);
          return false;
        }}
        disabled={reading}
      >
        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
        <p className="ant-upload-text">{reading ? 'Đang đọc file...' : (fileName ?? 'Chọn hoặc kéo thả file (xlsx, xls, csv)')}</p>
        <p className="ant-upload-hint">Dòng đầu là header: {KEYS.map((k) => LUCKY_TIME_COLUMNS[k]).join(' | ')}</p>
      </Upload.Dragger>

      {fileIssues.map((i, n) => (
        <Alert key={n} type="error" showIcon message={i.row === null ? i.reason : `Dòng ${i.row}: ${i.reason}`} />
      ))}

      {parsed && parsed.preview.length > 0 && (
        <>
          <Space>
            <Tag color="green">{parsed.rows.length} dòng hợp lệ</Tag>
            <Tag color={parsed.issues.length ? 'red' : 'default'}>{parsed.issues.length} lỗi</Tag>
          </Space>
          {parsed.issues.length > 0 && <Alert type="error" showIcon message="File còn dòng lỗi: sửa file rồi chọn lại để có thể import." />}
          <Table<PreviewRow>
            rowKey="row"
            size="small"
            columns={columns}
            dataSource={parsed.preview}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            onRow={(r) => ({ style: r.issues.length ? { background: 'rgba(255,77,79,0.10)' } : undefined })}
            scroll={{ x: 1100 }}
          />
        </>
      )}

      <Button type="primary" disabled={blocked} loading={importing} onClick={confirmImport}>
        Import
      </Button>
      <Typography.Text type="secondary">Chưa có API: nút Import hiện chỉ báo chưa hỗ trợ (stub).</Typography.Text>
    </Space>
  );
}
