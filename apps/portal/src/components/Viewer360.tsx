import { useState, useEffect, useRef, useCallback } from 'react';
import type { Image } from '@360-imaging/shared';

interface Viewer360Props {
  images: Image[];
  onImageClick?: (image: Image) => void;
}

const FRAME_COUNT = 24;
const ANGLE_STEP = 360 / FRAME_COUNT; // 15 degrees
const AUTO_PLAY_FPS = 2;

export function Viewer360({ images, onImageClick }: Viewer360Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartIndex = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sort images by angle and create frame map
  const frameMap = useRef<Map<number, Image>>(new Map());

  useEffect(() => {
    frameMap.current.clear();
    images.forEach((img) => {
      if (img.angleDeg !== undefined) {
        frameMap.current.set(img.angleDeg, img);
      }
    });
  }, [images]);

  // Get all expected angles (0, 15, 30, ... 345)
  const expectedAngles = Array.from({ length: FRAME_COUNT }, (_, i) => i * ANGLE_STEP);

  // Get current angle from index
  const currentAngle = expectedAngles[currentIndex] || 0;
  const currentImage = frameMap.current.get(currentAngle);

  // Auto-play effect
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % FRAME_COUNT);
    }, 1000 / AUTO_PLAY_FPS);

    return () => clearInterval(interval);
  }, [isPlaying]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentIndex((prev) => (prev - 1 + FRAME_COUNT) % FRAME_COUNT);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentIndex((prev) => (prev + 1) % FRAME_COUNT);
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Mouse drag handling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setIsPlaying(false);
    dragStartX.current = e.clientX;
    dragStartIndex.current = currentIndex;
  }, [currentIndex]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStartX.current;
    const sensitivity = 10; // pixels per frame
    const frameDelta = Math.round(deltaX / sensitivity);
    const newIndex = (dragStartIndex.current + frameDelta + FRAME_COUNT * 100) % FRAME_COUNT;
    setCurrentIndex(newIndex);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch handling
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true);
    setIsPlaying(false);
    dragStartX.current = e.touches[0].clientX;
    dragStartIndex.current = currentIndex;
  }, [currentIndex]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;

    const deltaX = e.touches[0].clientX - dragStartX.current;
    const sensitivity = 10;
    const frameDelta = Math.round(deltaX / sensitivity);
    const newIndex = (dragStartIndex.current + frameDelta + FRAME_COUNT * 100) % FRAME_COUNT;
    setCurrentIndex(newIndex);
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Get QC status for an image
  const getQCStatus = (image: Image | undefined) => {
    if (!image?.qc) return 'pending';
    if (image.qc.sharpness?.status === 'fail' || image.qc.exposure?.status === 'fail') {
      return 'fail';
    }
    if (image.qc.sharpness?.status === 'warn' || image.qc.exposure?.status === 'warn') {
      return 'warn';
    }
    return 'pass';
  };

  const getQCColor = (status: string) => {
    switch (status) {
      case 'pass': return 'bg-green-500';
      case 'warn': return 'bg-yellow-500';
      case 'fail': return 'bg-red-500';
      default: return 'bg-gray-400';
    }
  };

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden">
      {/* Main viewer */}
      <div
        ref={containerRef}
        className="relative aspect-video bg-black cursor-grab active:cursor-grabbing select-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {currentImage?.thumbKeys?.['1200'] ? (
          <img
            src={`/api/thumbnails/${currentImage.thumbKeys['1200']}`}
            alt={`${currentAngle}°`}
            className="w-full h-full object-contain"
            draggable={false}
            onClick={() => onImageClick?.(currentImage)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center text-gray-400">
              <div className="text-4xl mb-2">{currentAngle}°</div>
              <div className="text-sm">No image captured</div>
            </div>
          </div>
        )}

        {/* Angle indicator */}
        <div className="absolute top-4 left-4 bg-black/70 text-white px-3 py-2 rounded-lg">
          <span className="text-2xl font-mono">{currentAngle}°</span>
        </div>

        {/* QC badge */}
        {currentImage && (
          <div className={`absolute top-4 right-4 ${getQCColor(getQCStatus(currentImage))} text-white px-3 py-1 rounded-lg text-sm font-medium`}>
            {getQCStatus(currentImage).toUpperCase()}
          </div>
        )}

        {/* Controls overlay */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center space-x-4">
          <button
            onClick={() => setCurrentIndex((prev) => (prev - 1 + FRAME_COUNT) % FRAME_COUNT)}
            className="bg-black/70 hover:bg-black/90 text-white p-2 rounded-lg"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="bg-black/70 hover:bg-black/90 text-white p-3 rounded-lg"
          >
            {isPlaying ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              </svg>
            )}
          </button>

          <button
            onClick={() => setCurrentIndex((prev) => (prev + 1) % FRAME_COUNT)}
            className="bg-black/70 hover:bg-black/90 text-white p-2 rounded-lg"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Instructions */}
        <div className="absolute bottom-4 right-4 text-white/60 text-xs">
          Drag to rotate • Arrow keys • Space to play
        </div>
      </div>

      {/* Frame strip */}
      <div className="p-4 bg-gray-800">
        <div className="flex justify-between items-center mb-2">
          <span className="text-white/80 text-sm">
            Frame {currentIndex + 1} of {FRAME_COUNT}
          </span>
          <span className="text-white/60 text-sm">
            {images.length} / {FRAME_COUNT} captured
          </span>
        </div>

        <div className="flex gap-1 overflow-x-auto pb-2">
          {expectedAngles.map((angle, index) => {
            const image = frameMap.current.get(angle);
            const isActive = index === currentIndex;
            const isMissing = !image;
            const qcStatus = getQCStatus(image);

            return (
              <button
                key={angle}
                onClick={() => setCurrentIndex(index)}
                className={`relative flex-shrink-0 w-12 h-12 rounded border-2 transition-all ${
                  isActive
                    ? 'border-blue-500 ring-2 ring-blue-500/50'
                    : isMissing
                    ? 'border-dashed border-gray-600'
                    : 'border-transparent hover:border-gray-500'
                }`}
              >
                {image?.thumbKeys?.['150'] ? (
                  <img
                    src={`/api/thumbnails/${image.thumbKeys['150']}`}
                    alt={`${angle}°`}
                    className="w-full h-full object-cover rounded"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-700 rounded flex items-center justify-center">
                    <span className="text-gray-500 text-xs">{angle}°</span>
                  </div>
                )}

                {/* QC indicator dot */}
                {image && (
                  <div
                    className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border border-gray-800 ${getQCColor(qcStatus)}`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
