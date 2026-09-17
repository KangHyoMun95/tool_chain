'use client';

import { useState } from 'react';
import { LoginForm, ProFormText } from '@ant-design/pro-components';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { App, Spin } from 'antd';
import { useRouter } from 'next/navigation';
import { LoginRequest } from '@toolhackchain/shared';
import { useLogin } from '@/lib/api/auth';
import { homeForRole } from '@/lib/auth/current-user';

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
        background:
          'radial-gradient(1200px 500px at 50% -10%, rgba(34,211,238,0.06), transparent), #0A0E14',
      }}
    >
      {/* Spinner during the API call and while navigating to the target page. */}
      <Spin
        spinning={login.isPending || redirecting}
        fullscreen
        tip={redirecting ? 'Đang tải...' : 'Đang đăng nhập...'}
      />
      <LoginForm<LoginRequest>
        title="ToolHackChain"
        subTitle="Đăng nhập khu vực quản trị"
        onFinish={onFinish}
        loading={login.isPending}
      >
        <ProFormText
          name="username"
          fieldProps={{ size: 'large', prefix: <UserOutlined /> }}
          placeholder="Tên đăng nhập"
          rules={[{ required: true, message: 'Nhập tên đăng nhập' }]}
        />
        <ProFormText.Password
          name="password"
          fieldProps={{ size: 'large', prefix: <LockOutlined /> }}
          placeholder="Mật khẩu"
          rules={[{ required: true, message: 'Nhập mật khẩu' }]}
        />
      </LoginForm>
    </div>
  );
}
