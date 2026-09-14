'use client';

import { LoginForm, ProFormText } from '@ant-design/pro-components';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useRouter } from 'next/navigation';
import { LoginRequest } from '@toolhackchain/shared';
import { useLogin } from '@/lib/api/auth';
import { homeForRole } from '@/lib/auth/current-user';

export default function LoginPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const login = useLogin();

  const onFinish = async (values: LoginRequest) => {
    try {
      const res = await login.mutateAsync(values);
      message.success('Đăng nhập thành công');
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
        background: '#f5f6f8',
      }}
    >
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
