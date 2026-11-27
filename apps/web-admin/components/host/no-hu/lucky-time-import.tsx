'use client';

import { useState } from 'react';
import { Alert, App, Button, Space, Table, Tag, Typography, Upload } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { InboxOutlined } from '@ant-design/icons';
import { LUCKY_TIME_COLUMNS, type LuckyTimeColumnKey, type LuckyTimeParsed } from '@toolhackchain/shared';
import { importLuckyTimes, LuckyTimeApiNotReadyError, TEMP_NO_HU_CATEGORIES, type CategoryFilter } from '@/lib/api/lucky-time';
import { CategorySelect } from './category-select';

type PreviewRow = LuckyTimeParsed['preview'][number];
const KEYS = Object.keys(LUCKY_TIME_COLUMNS) as LuckyTimeColumnKey[];

export function LuckyTimeImport() {
  const { message, modal } = App.useApp();
  const [category, setCategory] = useState<CategoryFilter>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<LuckyTimeParsed | null>(null);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);

  const categoryLabel = category === null ? 'Tất cả (dùng chung)' : TEMP_NO_HU_CATEGORIES.find((c) => c.id === category)?.name ?? '';
  const fileIssues = parsed?.issues.filter((i) => i.row === null || parsed.preview.length === 0) ?? [];
  const blocked = !parsed || parsed.issues.length > 0 || parsed.rows.length === 0;

  async function readFile(file: File) {
    setReading(true);
    setFileName(file.name);
    setParsed(null);
    try {
      // Tải thư viện đọc bảng tính khi cần (không đưa vào bundle trang khác).
      const { readLuckyTimeFile } = await import('@toolhackchain/shared/lucky-time-file');
      setParsed(readLuckyTimeFile(await file.arrayBuffer()));
    } finally {
      setReading(false);
    }
  }

  function confirmImport() {
    if (!parsed || blocked) return;
    modal.confirm({
      title: `Thay thế lịch của "${categoryLabel}"?`,
      content: `Import sẽ THAY THẾ lịch lucky time đang hiệu lực của "${categoryLabel}" bằng ${parsed.rows.length} dòng trong file ${fileName}.`
        + (category === null ? ' Chỉ lịch dùng chung bị thay; lịch riêng của từng category giữ nguyên.' : ''),
      okText: 'Import',
      cancelText: 'Hủy',
      onOk: async () => {
        setImporting(true);
        try {
          await importLuckyTimes(category, parsed.rows.map((r) => r.data));
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
      <Space wrap>
        <span>Category:</span>
        <CategorySelect value={category} onChange={setCategory} />
      </Space>
      <Alert
        type="warning"
        showIcon
        message={`Import sẽ THAY THẾ lịch hiện tại của "${categoryLabel}".`}
        description={category === null
          ? 'Chọn "Tất cả" chỉ thay lịch dùng chung; lịch riêng của từng category không bị đụng tới. Lịch cũ không bị xóa, chỉ được đánh dấu đã thay thế.'
          : 'Lịch cũ của category này không bị xóa, chỉ được đánh dấu đã thay thế. Lịch dùng chung không bị đụng tới.'}
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
