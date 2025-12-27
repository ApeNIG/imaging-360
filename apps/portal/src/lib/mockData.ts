import type { SessionWithDetails, Image, Site } from '@360-imaging/shared';

const orgId = 'demo-org-001';
const siteId = 'demo-site-001';
const sessionId = 'demo-session-001';
const vehicleId = 'demo-vehicle-001';

export const mockSites: Site[] = [
  {
    id: siteId,
    orgId,
    name: 'Main Dealership',
    slug: 'main-dealership',
    address: {
      street: '123 Auto Row',
      city: 'Car City',
      state: 'CA',
      zip: '90210',
    },
    timezone: 'America/Los_Angeles',
    settings: {},
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  {
    id: 'demo-site-002',
    orgId,
    name: 'West Branch',
    slug: 'west-branch',
    address: {
      street: '456 Motor Ave',
      city: 'Car City',
      state: 'CA',
      zip: '90211',
    },
    timezone: 'America/Los_Angeles',
    settings: {},
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
];

export const mockSessions: SessionWithDetails[] = [
  {
    id: sessionId,
    orgId,
    siteId,
    vehicleId,
    mode: 'studio360',
    status: 'active',
    operatorId: 'demo-operator-001',
    deviceId: 'demo-device-001',
    shotList: {
      studio360: { frameCount: 24, angleStep: 15 },
      stills: [],
    },
    startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    vehicle: {
      id: vehicleId,
      orgId,
      siteId,
      vin: '1HGBH41JXMN109186',
      stock: 'STK12345',
      meta: { year: 2024, make: 'Honda', model: 'Accord' },
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
    operator: { id: 'demo-operator-001', name: 'John Smith' },
    site: { id: siteId, name: 'Main Dealership' },
    imageCount: 18,
  },
  {
    id: 'demo-session-002',
    orgId,
    siteId,
    vehicleId: 'demo-vehicle-002',
    mode: 'stills',
    status: 'complete',
    operatorId: 'demo-operator-001',
    deviceId: 'demo-device-001',
    shotList: {
      studio360: { frameCount: 24, angleStep: 15 },
      stills: [
        { name: 'front', required: true },
        { name: 'rear', required: true },
        { name: 'interior', required: true },
      ],
    },
    startedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    completedAt: new Date(Date.now() - 23 * 60 * 60 * 1000),
    vehicle: {
      id: 'demo-vehicle-002',
      orgId,
      siteId,
      vin: '5YJSA1E26MF123456',
      stock: 'STK99887',
      meta: { year: 2023, make: 'Tesla', model: 'Model S' },
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
    operator: { id: 'demo-operator-001', name: 'John Smith' },
    site: { id: siteId, name: 'Main Dealership' },
    imageCount: 12,
  },
  {
    id: 'demo-session-003',
    orgId,
    siteId: 'demo-site-002',
    vehicleId: 'demo-vehicle-003',
    mode: 'walk360',
    status: 'abandoned',
    operatorId: 'demo-operator-002',
    deviceId: 'demo-device-002',
    shotList: {
      studio360: { frameCount: 24, angleStep: 15 },
      stills: [],
    },
    startedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    abandonedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    vehicle: {
      id: 'demo-vehicle-003',
      orgId,
      siteId: 'demo-site-002',
      vin: 'WVWZZZ3CZWE123456',
      stock: 'STK55443',
      meta: { year: 2022, make: 'Volkswagen', model: 'ID.4' },
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
    operator: { id: 'demo-operator-002', name: 'Jane Doe' },
    site: { id: 'demo-site-002', name: 'West Branch' },
    imageCount: 8,
  },
];

// Generate 18 mock images for studio360 session (0°, 15°, 30°, ..., 255°)
const generateStudio360Images = (): Image[] => {
  const images: Image[] = [];
  const angles = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255];

  angles.forEach((angle, index) => {
    const qcStatus = index === 5 ? 'warn' : index === 10 ? 'fail' : 'pass';
    const status = index < 15 ? 'processed' : 'published';

    images.push({
      id: `demo-image-${String(index + 1).padStart(3, '0')}`,
      orgId,
      siteId,
      sessionId,
      vehicleId,
      storageKey: `org/${orgId}/site/${siteId}/session/${sessionId}/img-${angle}.jpg`,
      hashSha256: `hash${angle}${index}`,
      angleDeg: angle,
      shotName: `angle_${angle}`,
      width: 4032,
      height: 3024,
      thumbKeys: {
        '150': `thumbs/img-${angle}_150.jpg`,
        '600': `thumbs/img-${angle}_600.jpg`,
        '1200': `thumbs/img-${angle}_1200.jpg`,
      },
      qc: {
        sharpness: { score: qcStatus === 'fail' ? 0.3 : qcStatus === 'warn' ? 0.6 : 0.85 + Math.random() * 0.1, status: qcStatus },
        exposure: { status: 'pass' },
      },
      qcVersion: 1,
      status: status as 'pending' | 'processing' | 'processed' | 'published' | 'failed',
      createdAt: new Date(Date.now() - (24 - index) * 5 * 60 * 1000),
      publishedAt: status === 'published' ? new Date() : undefined,
    });
  });

  return images;
};

export const mockImages: Record<string, Image[]> = {
  [sessionId]: generateStudio360Images(),
  'demo-session-002': [
    {
      id: 'demo-stills-001',
      orgId,
      siteId,
      sessionId: 'demo-session-002',
      vehicleId: 'demo-vehicle-002',
      storageKey: `org/${orgId}/site/${siteId}/session/demo-session-002/front.jpg`,
      hashSha256: 'hashfront001',
      shotName: 'front',
      width: 4032,
      height: 3024,
      thumbKeys: { '150': 'thumbs/front_150.jpg', '600': 'thumbs/front_600.jpg', '1200': 'thumbs/front_1200.jpg' },
      qc: { sharpness: { score: 0.92, status: 'pass' }, exposure: { status: 'pass' } },
      qcVersion: 1,
      status: 'published',
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      publishedAt: new Date(Date.now() - 23 * 60 * 60 * 1000),
    },
  ],
};

// Placeholder image URLs (using picsum for demo)
export const getImageUrl = (storageKey: string, size: '150' | '600' | '1200' = '600'): string => {
  // Extract angle from storage key for consistent images
  const match = storageKey.match(/img-(\d+)\.jpg/);
  const seed = match ? parseInt(match[1]) : Math.floor(Math.random() * 100);

  const sizes: Record<string, string> = {
    '150': '150/100',
    '600': '600/400',
    '1200': '1200/800',
  };

  return `https://picsum.photos/seed/car${seed}/${sizes[size]}`;
};
