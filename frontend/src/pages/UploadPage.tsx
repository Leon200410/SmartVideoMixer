import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { VideoUploader } from '../components/VideoUploader';
import { useAppStore } from '../store/useAppStore';
import { VideoInfo } from '../types';

export function UploadPage() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const { setVideo, setSegments, setTemplateId, reset } = useAppStore();

  const handleUploadSuccess = (video: VideoInfo) => {
    reset();
    setVideo(video);
    setSegments([]);
    setTemplateId(null);
    navigate(`/video/${video.videoId}/template`);
  };

  return (
    <div className="step-panel space-y-6">
      {error && (
        <div className="glass flex items-start gap-3 border-red-500/30 bg-red-500/10 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400" />
          <div>
            <h3 className="font-bold text-red-300">出错了</h3>
            <p className="text-sm text-red-200/80">{error}</p>
          </div>
        </div>
      )}

      <VideoUploader
        onUploadSuccess={handleUploadSuccess}
        onUploadError={setError}
      />

      <div className="mx-auto max-w-3xl text-center text-sm text-slate-500">
        上传素材组后：选择模板 → 按模板逻辑智能拆分 → 调整片段 → 生成短视频
      </div>
    </div>
  );
}
