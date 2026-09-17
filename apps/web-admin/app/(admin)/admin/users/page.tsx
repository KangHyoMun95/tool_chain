'use client';

import { PageContainer } from '@ant-design/pro-components';
import { UserTable } from '@/components/admin/user-table';

export default function AdminUsersPage() {
  return (
    <PageContainer
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <span>Quản lý người dùng</span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: '#9CA3AF',
              padding: '2px 10px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid #1F2937',
            }}
          >
            Hệ thống thành viên
          </span>
        </span>
      }
      extra={[
        <span
          key="status"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: '#9CA3AF',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#10B981',
              boxShadow: '0 0 8px rgba(16,185,129,0.6)',
              animation: 'thc-users-pulse 2s ease-in-out infinite',
            }}
          />
          Hệ thống hoạt động ổn định
        </span>,
      ]}
    >
      <UserTable />
      <style jsx global>{`
        @keyframes thc-users-pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.45;
          }
        }
      `}</style>
    </PageContainer>
  );
}
