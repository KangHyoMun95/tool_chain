'use client';

import { useState } from 'react';
import { ProLayout, type MenuDataItem } from '@ant-design/pro-components';
import { Dropdown, Spin, Tag } from 'antd';
import {
  DashboardOutlined,
  DollarOutlined,
  GlobalOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Role } from '@toolhackchain/shared';
import { useCurrentUser, useLogout } from '@/lib/auth/current-user';
import { useMyProfile } from '@/lib/api/profile';

/** Sidebar menu per role — HOST manages Admin(Con), ADMIN_CON manages Users. */
function menuForRole(role: Role): MenuDataItem[] {
  if (role === Role.HOST) {
    return [
      { path: '/host/dashboard', name: 'Dashboard', icon: <DashboardOutlined /> },
      { path: '/host/admins', name: 'Quản lý người dùng', icon: <TeamOutlined /> },
    ];
  }
  if (role === Role.ADMIN_CON) {
    return [
      { path: '/admin/dashboard', name: 'Dashboard', icon: <DashboardOutlined /> },
      { path: '/admin/users', name: 'Quản lý người dùng', icon: <UserOutlined /> },
      { path: '/admin/hostnames', name: 'Quản lý trang chủ', icon: <GlobalOutlined /> },
    ];
  }
  return [];
}

/**
 * Shared admin chrome for the (host) and (admin) route groups. The sidebar and
 * header adapt to the logged-in user's role; header shows name + role + logout.
 */
export function AppProLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useCurrentUser();
  const logout = useLogout();
  const { data: profile } = useMyProfile();
  // Keeps a full-screen spinner up while clearing the session and navigating
  // to the login screen.
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = () => {
    setLoggingOut(true);
    logout();
  };

  const role = user?.role ?? Role.USER;

  return (
    <ProLayout
      title="ToolHackChain"
      logo={<SafetyCertificateOutlined style={{ fontSize: 22 }} />}
      layout="side"
      fixSiderbar
      location={{ pathname }}
      route={{ path: '/', routes: menuForRole(role) }}
      menuItemRender={(item, dom) =>
        item.path ? <Link href={item.path}>{dom}</Link> : dom
      }
      // Header (top-right): Admin(Con) points balance + avatar.
      actionsRender={() =>
        profile?.role === Role.ADMIN_CON
          ? [
              <Tag color="gold" key="points" icon={<DollarOutlined />}>
                {profile.points} điểm
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
      {children}
    </ProLayout>
  );
}
