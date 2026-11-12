'use client';

import { useState } from 'react';
import { ProLayout, type MenuDataItem } from '@ant-design/pro-components';
import { App, Dropdown, Spin, Tag } from 'antd';
import {
  DashboardOutlined,
  DollarOutlined,
  KeyOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ROLE, type Role } from '@/lib/auth/roles';
import { useCurrentUser, useLogout } from '@/lib/auth/current-user';
import { useMyProfile } from '@/lib/api/profile';
import { ChangePasswordModal } from './change-password-modal';

/** Sidebar menu per role — HOST manages Admin(Con), ADMIN manages Users. */
function menuForRole(role: Role): MenuDataItem[] {
  if (role === ROLE.HOST) {
    return [
      { path: '/host/dashboard', name: 'Dashboard', icon: <DashboardOutlined /> },
      { path: '/host/admins', name: 'Quản lý người dùng', icon: <TeamOutlined /> },
      { path: '/host/new-users', name: 'Quản lý người mới', icon: <UserAddOutlined /> },
    ];
  }
  if (role === ROLE.ADMIN) {
    return [
      { path: '/admin/dashboard', name: 'Dashboard', icon: <DashboardOutlined /> },
      { path: '/admin/users', name: 'Quản lý người dùng', icon: <UserOutlined /> },
    ];
  }
  return [];
}

/**
 * Shared admin chrome for the (host) and (admin) route groups. The sidebar and
 * header adapt to the logged-in user's role; header shows name + role; avatar menu: change password, logout.
 */
export function AppProLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useCurrentUser();
  const logout = useLogout();
  const { data: profile } = useMyProfile();
  // Keeps a full-screen spinner up while clearing the session and navigating
  // to the login screen.
  const [loggingOut, setLoggingOut] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const { message } = App.useApp();

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      message.error('Không đăng xuất được. Vui lòng thử lại.');
      setLoggingOut(false);
    }
  };

  const role = user?.role ?? ROLE.USER;

  return (
    <ProLayout
      title="ToolHackChain"
      logo={<SafetyCertificateOutlined style={{ fontSize: 22 }} />}
      layout="side"
      navTheme="realDark"
      token={{
        bgLayout: '#0A0E14',
        sider: {
          colorMenuBackground: '#0B0F16',
          colorTextMenuSelected: '#22D3EE',
          colorBgMenuItemSelected: 'rgba(34,211,238,0.08)',
        },
        header: { colorBgHeader: '#0B0F16' },
      }}
      fixSiderbar
      location={{ pathname }}
      route={{ path: '/', routes: menuForRole(role) }}
      menuItemRender={(item, dom) =>
        item.path ? <Link href={item.path}>{dom}</Link> : dom
      }
      // Header (top-right): Admin(Con) points balance (bigint dạng chuỗi) + avatar.
      actionsRender={() =>
        profile?.role === ROLE.ADMIN
          ? [
              <Tag color="gold" key="points" icon={<DollarOutlined />}>
                {BigInt(profile.balance).toLocaleString('vi-VN')} điểm
              </Tag>,
            ]
          : []
      }
      avatarProps={{
        icon: <UserOutlined />,
        size: 'small',
        title: user?.username ?? '',
        render: (_props, dom) => (
          <Dropdown
            menu={{
              items: [
                {
                  key: 'change-password',
                  icon: <KeyOutlined />,
                  label: 'Đổi mật khẩu',
                  onClick: () => setChangingPassword(true),
                },
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: 'Đăng xuất',
                  onClick: handleLogout,
                },
              ],
            }}
          >
            {dom}
          </Dropdown>
        ),
      }}
    >
      <Spin spinning={loggingOut} fullscreen tip="Đang đăng xuất..." />
      <ChangePasswordModal open={changingPassword} onOpenChange={setChangingPassword} />
      {children}
    </ProLayout>
  );
}
