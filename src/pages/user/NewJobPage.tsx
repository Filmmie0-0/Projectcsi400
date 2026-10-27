import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import QueryState, { ErrorText } from '../../components/common/QueryState';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import Modal from '../../components/ui/Modal';
import { JOB_TYPE, PRIORITY, UNIT_TYPE, toOptions } from '../../constants/labels';
import { useBuildings, useJobMutation } from '../../hooks/useJobs';
import { jobService } from '../../services/jobService';
import { useAuthStore } from '../../store/authStore';
import { cn } from '../../utils/cn';
import type { JobInput, JobType, Priority, UnitType } from '../../types/job';

export default function NewJobPage() {
  const user = useAuthStore((s) => s.user!);
  const navigate = useNavigate();
  const buildings = useBuildings();
  const createJob = useJobMutation(jobService.createJob);
  const [buildingId, setBuildingId] = useState<number | null>(null);
  const [modal, setModal] = useState<'building' | 'unit' | null>(null);
  const [form, setForm] = useState<Omit<JobInput, 'unitId'> & { unitId: number | '' }>({
    unitId: '', jobType: 'RENOVATION', title: '', description: '', priority: 'NORMAL', preferredDate: '',
    contactName: user.fullName, contactPhone: user.phone ?? '',
  });

  const list = buildings.data ?? [];
  const building = list.find((b) => b.buildingId === buildingId) ?? list[0];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    createJob.mutate([{ ...form, unitId: Number(form.unitId) }], { onSuccess: (r) => navigate(`/jobs/${r.jobId}`) });
  };

  return (
    <>
      <PageHeader title="แจ้งงานใหม่" description="ตรวจสอบห้องเช่า หรือรีโนเวท/ซ่อมแซมพื้นที่ในตึกของคุณ" />
      <QueryState query={buildings}>
        <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">1. เลือกสถานที่</h2>
              <Button type="button" variant="ghost" onClick={() => setModal('building')}><Plus className="h-4 w-4" /> เพิ่มตึก</Button>
            </div>
            {!list.length && <p className="text-sm text-espresso-500">ยังไม่มีตึก กด "เพิ่มตึก" ก่อน</p>}
            {list.length > 0 && (
              <Select
                label="ตึก/หอพัก"
                value={building?.buildingId}
                onChange={(e) => { setBuildingId(Number(e.target.value)); setForm({ ...form, unitId: '' }); }}
                options={list.map((b) => ({ value: b.buildingId, label: b.name }))}
              />
            )}
            {building && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-espresso-700">ห้อง/พื้นที่</span>
                  <button type="button" onClick={() => setModal('unit')} className="text-walnut-600 hover:underline">+ เพิ่มห้อง/พื้นที่</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {building.units.map((u) => (
                    <button
                      type="button"
                      key={u.unitId}
                      onClick={() => setForm({ ...form, unitId: u.unitId })}
                      className={cn(
                        'rounded-lg border p-3 text-left text-sm transition-colors',
                        form.unitId === u.unitId ? 'border-walnut-500 bg-walnut-50' : 'border-line hover:bg-cream-100',
                      )}
                    >
                      <p className="font-medium">{u.code}</p>
                      <p className="text-xs text-espresso-500">{UNIT_TYPE[u.unitType]}{u.sizeSqm ? ` · ${u.sizeSqm} ตร.ม.` : ''}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="space-y-4">
            <h2 className="font-semibold">2. รายละเอียดงาน</h2>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(JOB_TYPE) as JobType[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setForm({ ...form, jobType: t })}
                  className={cn('rounded-lg border p-3 text-sm', form.jobType === t ? 'border-walnut-500 bg-walnut-50 font-medium' : 'border-line')}
                >
                  {JOB_TYPE[t]}
                </button>
              ))}
            </div>
            <Input label="หัวข้องาน" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required
              placeholder={form.jobType === 'INSPECTION' ? 'ตรวจห้องก่อนผู้เช่าใหม่เข้า' : 'ทาสีใหม่ทั้งห้อง'} />
            <Textarea label="รายละเอียด" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="ความเร่งด่วน" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })} options={toOptions(PRIORITY)} />
              <Input label="วันที่สะดวกให้เข้าประเมิน" type="date" value={form.preferredDate} onChange={(e) => setForm({ ...form, preferredDate: e.target.value })} />
              <Input label="ผู้ติดต่อหน้างาน" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
              <Input label="เบอร์โทร" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
            </div>
            <ErrorText error={createJob.error} />
            <Button disabled={!form.unitId || !form.title.trim() || createJob.isPending}>ส่งงาน</Button>
          </Card>
        </form>
      </QueryState>
      {modal === 'building' && <BuildingModal onClose={(id) => { setModal(null); if (id) setBuildingId(id); }} />}
      {modal === 'unit' && building && <UnitModal buildingId={building.buildingId} onClose={() => setModal(null)} />}
    </>
  );
}

function BuildingModal({ onClose }: { onClose: (buildingId?: number) => void }) {
  const create = useJobMutation(jobService.createBuilding);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  return (
    <Modal
      open
      title="เพิ่มตึก/หอพัก"
      onClose={() => onClose()}
      footer={
        <Button disabled={!name.trim() || !address.trim() || create.isPending}
          onClick={() => create.mutate([{ name, address, units: [] }], { onSuccess: (r) => onClose(r.buildingId) })}>
          บันทึก
        </Button>
      }
    >
      <div className="space-y-3">
        <Input label="ชื่อตึก" value={name} onChange={(e) => setName(e.target.value)} />
        <Textarea label="ที่อยู่" value={address} onChange={(e) => setAddress(e.target.value)} />
        <ErrorText error={create.error} />
      </div>
    </Modal>
  );
}

function UnitModal({ buildingId, onClose }: { buildingId: number; onClose: () => void }) {
  const add = useJobMutation(jobService.addUnit);
  const [unit, setUnit] = useState<{ unitType: UnitType; code: string; floor: string; sizeSqm: string }>({ unitType: 'ROOM', code: '', floor: '', sizeSqm: '' });
  return (
    <Modal
      open
      title="เพิ่มห้อง/พื้นที่"
      onClose={onClose}
      footer={
        <Button disabled={!unit.code.trim() || add.isPending}
          onClick={() => add.mutate([buildingId, { ...unit, sizeSqm: unit.sizeSqm ? Number(unit.sizeSqm) : undefined }], { onSuccess: onClose })}>
          บันทึก
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Select label="ประเภท" value={unit.unitType} onChange={(e) => setUnit({ ...unit, unitType: e.target.value as UnitType })} options={toOptions(UNIT_TYPE)} />
        <Input label="รหัส/เลขห้อง" value={unit.code} onChange={(e) => setUnit({ ...unit, code: e.target.value })} placeholder="305 หรือ G-01" />
        <Input label="ชั้น" value={unit.floor} onChange={(e) => setUnit({ ...unit, floor: e.target.value })} />
        <Input label="ขนาด (ตร.ม.)" type="number" value={unit.sizeSqm} onChange={(e) => setUnit({ ...unit, sizeSqm: e.target.value })} />
        <div className="col-span-2"><ErrorText error={add.error} /></div>
      </div>
    </Modal>
  );
}
