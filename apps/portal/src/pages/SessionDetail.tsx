import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { PORTAL_POLL_INTERVAL_MS } from '@360-imaging/shared';
import type { SessionWithDetails, Image } from '@360-imaging/shared';

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<SessionWithDetails | null>(null);
  const [images, setImages] = useState<Image[]>([]);
  const [selectedImage, setSelectedImage] = useState<Image | null>(null);
  const [viewMode, setViewMode] = useState<'gallery' | '360'>('gallery');
  const [isLoading, setIsLoading] = useState(true);
  const pollRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (id) {
      loadSession();
      loadImages();
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [id]);

  useEffect(() => {
    // Start polling if session is active
    if (session?.status === 'active') {
      pollRef.current = setInterval(loadImages, PORTAL_POLL_INTERVAL_MS);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [session?.status]);

  const loadSession = async () => {
    try {
      const data = await api.getSession(id!);
      setSession(data);
    } catch (error) {
      console.error('Failed to load session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadImages = async () => {
    try {
      const response = await api.getImages(id!);
      setImages(response.data);
    } catch (error) {
      console.error('Failed to load images:', error);
    }
  };

  const handlePublish = async (imageId: string) => {
    try {
      await api.publishImage(imageId);
      loadImages();
    } catch (error) {
      console.error('Failed to publish image:', error);
    }
  };

  const getQCBadge = (image: Image) => {
    if (!image.qc) return null;

    const sharpnessStatus = image.qc.sharpness?.status;
    const exposureStatus = image.qc.exposure?.status;

    if (sharpnessStatus === 'fail' || exposureStatus === 'fail') {
      return (
        <span className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
          QC Failed
        </span>
      );
    }

    if (sharpnessStatus === 'warn' || exposureStatus === 'warn') {
      return (
        <span className="absolute top-2 right-2 bg-yellow-500 text-white text-xs px-2 py-1 rounded">
          Warning
        </span>
      );
    }

    return (
      <span className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
        Pass
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Session not found</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {session.vehicle?.vin || session.vehicle?.stock || 'Unknown Vehicle'}
            </h1>
            <p className="text-gray-500 mt-1">
              {session.mode} • {session.operator?.name} •{' '}
              {new Date(session.startedAt).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                session.status === 'active'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {session.status}
            </span>
            {session.mode === 'studio360' && (
              <div className="flex rounded-md shadow-sm">
                <button
                  onClick={() => setViewMode('gallery')}
                  className={`px-4 py-2 text-sm font-medium rounded-l-md border ${
                    viewMode === 'gallery'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Gallery
                </button>
                <button
                  onClick={() => setViewMode('360')}
                  className={`px-4 py-2 text-sm font-medium rounded-r-md border-t border-r border-b ${
                    viewMode === '360'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  360 View
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Image Grid */}
      {viewMode === 'gallery' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {images.map((image) => (
            <div
              key={image.id}
              className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500"
              onClick={() => setSelectedImage(image)}
            >
              {image.thumbKeys?.['600'] ? (
                <img
                  src={`/api/thumbnails/${image.thumbKeys['600']}`}
                  alt={`Frame ${image.angleDeg || image.shotName}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-gray-400">Processing...</span>
                </div>
              )}
              {getQCBadge(image)}
              {image.angleDeg !== undefined && (
                <span className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                  {image.angleDeg}°
                </span>
              )}
              {image.status === 'published' && (
                <span className="absolute bottom-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
                  Published
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 360 View */}
      {viewMode === '360' && (
        <div className="bg-white rounded-lg shadow p-8">
          <div className="text-center text-gray-500">
            360 Viewer - Drag to rotate
            {/* TODO: Implement 360 viewer component */}
          </div>
        </div>
      )}

      {/* Image Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="bg-white rounded-lg max-w-4xl w-full mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="aspect-video bg-gray-100">
              {selectedImage.thumbKeys?.['1200'] && (
                <img
                  src={`/api/thumbnails/${selectedImage.thumbKeys['1200']}`}
                  alt="Full size"
                  className="w-full h-full object-contain"
                />
              )}
            </div>
            <div className="p-4 flex justify-between items-center">
              <div>
                <p className="font-medium">
                  {selectedImage.angleDeg !== undefined
                    ? `Angle: ${selectedImage.angleDeg}°`
                    : selectedImage.shotName}
                </p>
                <p className="text-sm text-gray-500">
                  QC: Sharpness {selectedImage.qc?.sharpness?.score || 'N/A'} •
                  Status: {selectedImage.status}
                </p>
              </div>
              <div className="flex space-x-2">
                {selectedImage.status === 'processed' && (
                  <button
                    onClick={() => handlePublish(selectedImage.id)}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    Publish
                  </button>
                )}
                <button
                  onClick={() => setSelectedImage(null)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
