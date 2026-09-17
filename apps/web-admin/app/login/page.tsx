'use client';

import { useState } from 'react';
import { ProForm, ProFormText } from '@ant-design/pro-components';
import {
  ArrowRightOutlined,
  LockOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { App, Button, Spin, Typography } from 'antd';
import { useRouter } from 'next/navigation';
import { LoginRequest } from '@toolhackchain/shared';
import { useLogin } from '@/lib/api/auth';
import { homeForRole } from '@/lib/auth/current-user';

// Mirrors the dark SOC theme tokens in app/providers.tsx — kept local since
// this page renders its own glass card outside the antd Layout components.
const MONO =
  "ui-monospace, 'JetBrains Mono', 'Space Mono', 'SFMono-Regular', Menlo, Consolas, monospace";
const CYAN = '#22D3EE';

export default function LoginPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const login = useLogin();
  // Keeps the overlay up from a successful response until the target page loads.
  const [redirecting, setRedirecting] = useState(false);

  const onFinish = async (values: LoginRequest) => {
    try {
      const res = await login.mutateAsync(values);
      message.success('Đăng nhập thành công');
      setRedirecting(true);
      router.replace(homeForRole(res.role));
      return true;
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Đăng nhập thất bại');
      return false;
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        position: 'relative',
        overflow: 'hidden',
        background: '#0A0E14',
      }}
    >
      {/* Ambient cyan glows — kept subtle per WEB-ADMIN.DESIGN.md §5 (no grid/particles). */}
      <div
        style={{
          position: 'absolute',
          top: -120,
          width: 420,
          height: 420,
          borderRadius: '50%',
          background: 'rgba(34,211,238,0.07)',
          filter: 'blur(90px)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: -140,
          right: -80,
          width: 420,
          height: 420,
          borderRadius: '50%',
          background: 'rgba(34,211,238,0.05)',
          filter: 'blur(100px)',
          pointerEvents: 'none',
        }}
      />

      <Spin
        spinning={login.isPending || redirecting}
        fullscreen
        tip={redirecting ? 'Đang tải...' : 'Đang đăng nhập...'}
      />

      <div
        style={{
          width: '100%',
          maxWidth: 440,
          position: 'relative',
          background:
            'linear-gradient(135deg, rgba(22,29,43,0.9) 0%, rgba(17,24,39,0.95) 100%)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid #1F2937',
          borderRadius: 16,
          padding: '32px 28px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35), 0 0 24px rgba(34,211,238,0.08)',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 999,
            background: 'rgba(34,211,238,0.08)',
            border: '1px solid rgba(34,211,238,0.35)',
            marginBottom: 16,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: CYAN,
              animation: 'toolhackchain-pulse 2s ease-in-out infinite',
            }}
          />
          <Typography.Text
            style={{
              color: CYAN,
              fontFamily: MONO,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Xác thực quản trị viên
          </Typography.Text>
        </div>

        <Typography.Title
          level={3}
          style={{
            fontFamily: MONO,
            color: '#F3F4F6',
            margin: 0,
            fontSize: 24,
          }}
        >
          Đăng nhập hệ thống
        </Typography.Title>
        <Typography.Text style={{ color: '#9CA3AF', fontSize: 13 }}>
          Trung tâm điều hành &amp; quản trị ToolHackChain
        </Typography.Text>

        <ProForm<LoginRequest>
          onFinish={onFinish}
          submitter={false}
          layout="vertical"
          style={{ marginTop: 24 }}
        >
          <ProFormText
            name="username"
            label="Tên đăng nhập"
            placeholder="Nhập tên đăng nhập"
            fieldProps={{
              size: 'large',
              prefix: <UserOutlined style={{ color: '#6B7280' }} />,
              style: { fontFamily: MONO },
            }}
            rules={[{ required: true, message: 'Nhập tên đăng nhập' }]}
          />
          <ProFormText.Password
            name="password"
            label="Mật khẩu"
            placeholder="Nhập mật khẩu"
            fieldProps={{
              size: 'large',
              prefix: <LockOutlined style={{ color: '#6B7280' }} />,
              style: { fontFamily: MONO },
            }}
            rules={[{ required: true, message: 'Nhập mật khẩu' }]}
          />
          <Button
            type="primary"
            ghost
            htmlType="submit"
            block
            size="large"
            loading={login.isPending}
            icon={<ArrowRightOutlined />}
            iconPosition="end"
            style={{
              marginTop: 4,
              height: 48,
              borderRadius: 10,
              fontWeight: 600,
              background: 'rgba(34,211,238,0.08)',
              boxShadow: '0 0 18px rgba(34,211,238,0.15)',
            }}
          >
            Đăng nhập
          </Button>
        </ProForm>
      </div>

      <style jsx global>{`
        @keyframes toolhackchain-pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.4;
          }
        }
      `}</style>
    </div>
  );
}
