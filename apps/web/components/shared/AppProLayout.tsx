'use client';

import { useState } from 'react';
import { ProLayout, type MenuDataItem } from '@ant-design/pro-components';
import { Dropdown, Spin, Tag } from 'antd';
import {
  LogoutOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Role } from '@toolhackchain/shared';
import { ROLE_LABEL, useCurrentUser, useLogout } from '@/lib/auth/current-user';

/** Sidebar menu per role — HOST manages Admin(Con), ADMIN_CON manages Users. */
function menuForRole(role: Role): MenuDataItem[] {
  if (role === Role.HOST) {
    return [
      { path: '/host/admins', name: 'Quản lý Admin Con', icon: <TeamOutlined /> },
    ];
  }
  if (role === Role.ADMIN_CON) {
    return [
      { path: '/admin/users', name: 'Quản lý User', icon: <UserOutlined /> },
    ];
  }
  return [];
}

const ROLE_TAG_COLOR: Record<Role, string> = {
  [Role.HOST]: 'red',
  [Role.ADMIN_CON]: 'blue',
  [Role.USER]: 'default',
};

/**
 * Shared admin chrome for the (host) and (admin) route groups. The sidebar and
 * header adapt to the logged-in user's role; header shows name + role + logout.
 */
export function AppProLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useCurrentUser();
  const logout = useLogout();
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
      // Header: role tag on the right + avatar with name and a logout dropdown.
      actionsRender={() => [
        <Tag color={ROLE_TAG_COLOR[role]} key="role">
          {ROLE_LABEL[role]}
        </Tag>,
      ]}
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
