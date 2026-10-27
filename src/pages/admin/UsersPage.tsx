import { useState } from 'react';
import { Plus } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import QueryState, { ErrorText } from '../../components/common/QueryState';
import Table, { Td, Th } from '../../components/ui/Table';
import Tabs from '../../components/ui/Tabs';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import { ROLE_LABEL } from '../../layouts/navigation/menus';
import { useCreateUser, useUpdateUser, useUsers } from '../../hooks/useUsers';
import { formatCurrency } from '../../utils/formatCurrency';
import type { Role, UserInput } from '../../types/user';

export default function UsersPage() {
  const [role, setRole] = useState<Role>('TECHNICIAN');
  const [creating, setCreating] = useState(false);
  const users = useUsers(role);
  const update = useUpdateUser();

  return (
    <>
      <PageHeader title="ผู้ใช้ & ช่าง" action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> เพิ่มผู้ใช้</Button>} />
      <Tabs value={role} onChange={setRole} tabs={(['TECHNICIAN', 'USER', 'ADMIN'] as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
      <div className="mt-4">
        <QueryState query={users}>
          <Table>
            <thead>
              <tr><Th>ชื่อ</Th><Th>อีเมล / โทร</Th>{role === 'TECHNICIAN' && <><Th>ความถนัด</Th><Th className="text-right">ค่าแรง/วัน</Th></>}<Th>สถานะ</Th><Th /></tr>
            </thead>
            <tbody>
              {users.data?.map((u) => (
                <tr key={u.userId}>
                  <Td className="font-medium">{u.fullName}</Td>
                  <Td className="text-sm">{u.email}<div className="text-xs text-espresso-500">{u.phone}</div></Td>
                  {role === 'TECHNICIAN' && (
                    <>
                      <Td className="text-sm">{u.skills}</Td>
                      <Td className="text-right">{formatCurrency(u.dailyWage ?? 0)}</Td>
                    </>
                  )}
                  <Td><Badge tone={u.status === 'ACTIVE' ? 'success' : 'neutral'}>{u.status === 'ACTIVE' ? 'ใช้งาน' : 'ระงับ'}</Badge></Td>
                  <Td className="text-right">
                    <Button
                      variant="ghost"
                      disabled={update.isPending}
                      onClick={() => update.mutate({ id: u.userId, status: u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })}
                    >
                      {u.status === 'ACTIVE' ? 'ระงับ' : 'เปิดใช้งาน'}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <ErrorText error={update.error} />
        </QueryState>
      </div>
      {creating && <CreateUserModal defaultRole={role} onClose={() => setCreating(false)} />}
    </>
  );
}

function CreateUserModal({ defaultRole, onClose }: { defaultRole: Role; onClose: () => void }) {
  const create = useCreateUser();
  const [u, setU] = useState<UserInput>({ email: '', password: '', fullName: '', phone: '', role: defaultRole, skills: '', dailyWage: 800 });
  const set = (k: keyof UserInput) => (e: { target: { value: string } }) => setU({ ...u, [k]: k === 'dailyWage' ? Number(e.target.value) : e.target.value });
  return (
    <Modal open title="เพิ่มผู้ใช้" onClose={onClose} footer={<Button disabled={create.isPending} onClick={() => create.mutate(u, { onSuccess: onClose })}>บันทึก</Button>}>
      <div className="grid grid-cols-2 gap-3">
        <Select label="บทบาท" value={u.role} onChange={set('role')} options={(Object.keys(ROLE_LABEL) as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
        <Input label="ชื่อ-นามสกุล" value={u.fullName} onChange={set('fullName')} />
        <Input label="อีเมล" type="email" value={u.email} onChange={set('email')} />
        <Input label="เบอร์โทร" value={u.phone} onChange={set('phone')} />
        <Input label="รหัสผ่านเริ่มต้น" type="password" value={u.password} onChange={set('password')} />
        {u.role === 'TECHNICIAN' && (
          <>
            <Input label="ค่าแรงรายวัน" type="number" value={u.dailyWage} onChange={set('dailyWage')} />
            <div className="col-span-2"><Input label="ความถนัด" value={u.skills} onChange={set('skills')} placeholder="ไฟฟ้า ประปา ทาสี" /></div>
          </>
        )}
        <div className="col-span-2"><ErrorText error={create.error} /></div>
      </div>
    </Modal>
  );
}
