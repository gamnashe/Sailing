import React, { useState } from 'react';
import { store } from '../services/store';
import { ClubPost, UserProfile } from '../types';
import { compressImage } from '../utils/imageCompression';
import {
  MessageSquare,
  Heart,
  Pin,
  Trash2,
  Image as ImageIcon,
  Link as LinkIcon,
  Send,
  Camera,
  X,
  ExternalLink,
  Sailboat,
  Sparkles,
  AlertCircle
} from 'lucide-react';

interface Props {
  currentUser: UserProfile;
  onSelectSail?: (sailId: string) => void;
}

export const CommunityFeed: React.FC<Props> = ({ currentUser, onSelectSail }) => {
  const posts = store.getPosts();
  const sails = store.getSails();
  const isAdmin = currentUser.role === 'admin';

  // New post state
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  const [selectedSailId, setSelectedSailId] = useState<string>('');
  const [linkInput, setLinkInput] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);
  const [commentContent, setCommentContent] = useState('');

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsCompressing(true);
    try {
      const newImages: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const compressed = await compressImage(files[i]);
        newImages.push(compressed);
      }
      setImages((prev) => [...prev, ...newImages]);
    } catch {
      alert('שגיאה בדחיסת התמונה');
    } finally {
      setIsCompressing(false);
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && images.length === 0 && !linkInput.trim()) return;

    let linkPreview: ClubPost['linkPreview'] = undefined;
    if (linkInput.trim()) {
      let url = linkInput.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      try {
        const parsed = new URL(url);
        linkPreview = {
          url,
          title: `קישור מאת ${parsed.hostname}`,
          description: 'לחץ לפתיחת הקישור המשותף בדפדפן',
          domain: parsed.hostname,
        };
      } catch {
        // fallback
      }
    }

    await store.createPost(
      currentUser.id,
      content.trim(),
      images,
      linkPreview,
      selectedSailId ? selectedSailId : undefined
    );

    // Reset form
    setContent('');
    setImages([]);
    setSelectedSailId('');
    setLinkInput('');
    setShowLinkInput(false);
  };

  const handleToggleLike = async (postId: string) => {
    await store.togglePostLike(postId, currentUser.id);
  };

  const handleAddComment = async (postId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!commentContent.trim()) return;
    await store.addPostComment(postId, currentUser.id, commentContent.trim());
    setCommentContent('');
  };

  const handleTogglePin = async (postId: string) => {
    await store.togglePinPost(postId);
  };

  const handleDeletePost = async (postId: string) => {
    if (confirm('האם למחוק פוסט זה מהפיד?')) {
      await store.deletePost(postId);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5 text-right">
      {/* Create New Post Box */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3 mb-3">
          <img
            src={currentUser.avatar}
            alt={currentUser.fullName}
            className="w-10 h-10 rounded-full object-cover border border-slate-200"
          />
          <div>
            <p className="font-bold text-slate-900 text-sm">{currentUser.fullName}</p>
            <p className="text-[11px] text-slate-500">שתף עדכון, חוויות שייט, תמונות או קישור</p>
          </div>
        </div>

        <form onSubmit={handleCreatePost} className="space-y-3">
          <textarea
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="מה חדש בים? ספרו על ההפלגה האחרונה, מזג אוויר, או תיאום ציוד..."
            className="w-full p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs focus:ring-2 focus:ring-sky-500 resize-none font-sans"
          />

          {/* Link Input Bar */}
          {showLinkInput && (
            <div className="flex gap-2 items-center bg-sky-50 p-2.5 rounded-xl border border-sky-100 text-xs animate-in fade-in duration-150">
              <LinkIcon className="w-4 h-4 text-sky-600 shrink-0" />
              <input
                type="url"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                placeholder="הדבק קישור (למשל windy.com, תחזית, סרטון...)"
                className="flex-1 bg-white border border-sky-200 px-3 py-1.5 rounded-lg text-xs focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setShowLinkInput(false);
                  setLinkInput('');
                }}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Images Previews */}
          {images.length > 0 && (
            <div className="flex gap-2 overflow-x-auto py-2">
              {images.map((img, idx) => (
                <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0 border border-slate-200">
                  <img src={img} alt="תמונה מועלית" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="absolute top-1 left-1 bg-black/70 hover:bg-black text-white p-1 rounded-full cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Sail linking selector */}
          <div className="flex items-center gap-2 text-xs">
            <Sailboat className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={selectedSailId}
              onChange={(e) => setSelectedSailId(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 px-3 py-1.5 rounded-xl text-xs focus:ring-2 focus:ring-sky-500 cursor-pointer max-w-xs"
            >
              <option value="">קשר להפלגה (אופציונלי)...</option>
              {sails.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.date})
                </option>
              ))}
            </select>
          </div>

          {/* Actions toolbar & submit */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <div className="flex items-center gap-1">
              <label className="p-2 text-sky-700 hover:bg-sky-50 rounded-xl transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold">
                <Camera className="w-4 h-4 text-sky-600" />
                <span>{isCompressing ? 'דוחס תמונות...' : 'הוסף תמונות'}</span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  disabled={isCompressing}
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={() => setShowLinkInput(!showLinkInput)}
                className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
              >
                <LinkIcon className="w-4 h-4 text-slate-500" />
                <span>קישור</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={(!content.trim() && images.length === 0 && !linkInput.trim()) || isCompressing}
              className="bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-sm transition active:scale-95 cursor-pointer flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              פרסם בפיד
            </button>
          </div>
        </form>
      </div>

      {/* Posts Feed List */}
      <div className="space-y-4">
        {posts.map((post) => {
          const hasLiked = post.likes.includes(currentUser.id);
          const showComments = activeCommentPostId === post.id;

          return (
            <div
              key={post.id}
              className={`bg-white rounded-3xl p-5 border shadow-xs transition ${
                post.isPinned ? 'border-sky-300 ring-2 ring-sky-100/80 bg-gradient-to-b from-sky-50/30 to-white' : 'border-slate-200/80'
              }`}
            >
              {/* Pinned post banner */}
              {post.isPinned && (
                <div className="flex items-center gap-1.5 text-xs font-bold text-sky-700 mb-3 bg-sky-100/60 px-3 py-1.5 rounded-xl w-fit">
                  <Pin className="w-3.5 h-3.5 rotate-45" />
                  <span>הודעת מנהל נעוצה בראש הפיד</span>
                </div>
              )}

              {/* Author Row */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <img
                    src={post.authorAvatar}
                    alt={post.authorName}
                    className="w-10 h-10 rounded-full object-cover border border-slate-200"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="font-bold text-slate-900 text-sm">{post.authorName}</p>
                      {post.authorRole === 'admin' && (
                        <span className="text-[10px] bg-sky-100 text-sky-800 font-bold px-1.5 py-0.2 rounded-md">
                          מנהל
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400">
                      {new Date(post.createdAt).toLocaleDateString('he-IL', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>

                {/* Admin controls: Pin & Delete */}
                <div className="flex items-center gap-1">
                  {isAdmin && (
                    <button
                      onClick={() => handleTogglePin(post.id)}
                      className={`p-1.5 rounded-lg transition cursor-pointer ${
                        post.isPinned
                          ? 'text-sky-600 bg-sky-50 hover:bg-sky-100'
                          : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                      }`}
                      title={post.isPinned ? 'בטל נעיצה' : 'הצמד לראש הפיד'}
                    >
                      <Pin className="w-4 h-4 rotate-45" />
                    </button>
                  )}

                  {(isAdmin || post.authorId === currentUser.id) && (
                    <button
                      onClick={() => handleDeletePost(post.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                      title="מחק פוסט"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Linked sail tag if present */}
              {post.sailId && post.sailTitle && (
                <div
                  onClick={() => onSelectSail?.(post.sailId!)}
                  className="mb-3 inline-flex items-center gap-1.5 bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs px-3 py-1 rounded-xl font-semibold border border-sky-200/60 cursor-pointer transition"
                >
                  <Sailboat className="w-3.5 h-3.5" />
                  <span>קשור להפלגה: {post.sailTitle}</span>
                </div>
              )}

              {/* Post Content Text */}
              <p className="text-slate-800 text-xs sm:text-sm whitespace-pre-line leading-relaxed mb-3">
                {post.content}
              </p>

              {/* Post Images Grid */}
              {post.images && post.images.length > 0 && (
                <div
                  className={`grid gap-2 mb-3 rounded-2xl overflow-hidden ${
                    post.images.length === 1 ? 'grid-cols-1' : post.images.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
                  }`}
                >
                  {post.images.map((imgUrl, i) => (
                    <div key={i} className="aspect-4/3 bg-slate-100 overflow-hidden rounded-xl">
                      <img src={imgUrl} alt="תמונת פוסט" className="w-full h-full object-cover hover:scale-105 transition" />
                    </div>
                  ))}
                </div>
              )}

              {/* Open Graph Link Preview */}
              {post.linkPreview && (
                <a
                  href={post.linkPreview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mb-3 bg-slate-50 hover:bg-slate-100 rounded-2xl border border-slate-200 overflow-hidden text-right transition group"
                >
                  {post.linkPreview.image && (
                    <img
                      src={post.linkPreview.image}
                      alt={post.linkPreview.title}
                      className="w-full h-36 object-cover"
                    />
                  )}
                  <div className="p-3">
                    <div className="flex items-center gap-1 text-[11px] text-sky-700 font-semibold mb-1">
                      <ExternalLink className="w-3 h-3" />
                      <span>{post.linkPreview.domain}</span>
                    </div>
                    <p className="font-bold text-slate-900 text-xs group-hover:text-sky-700 transition">
                      {post.linkPreview.title}
                    </p>
                    <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">
                      {post.linkPreview.description}
                    </p>
                  </div>
                </a>
              )}

              {/* Footer: Likes & Comments Bar */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => handleToggleLike(post.id)}
                    className={`flex items-center gap-1.5 font-bold transition cursor-pointer ${
                      hasLiked ? 'text-rose-600' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${hasLiked ? 'fill-rose-600' : ''}`} />
                    <span>{post.likes.length} לייקים</span>
                  </button>

                  <button
                    onClick={() =>
                      setActiveCommentPostId(activeCommentPostId === post.id ? null : post.id)
                    }
                    className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 font-bold transition cursor-pointer"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>{post.comments.length} תגובות</span>
                  </button>
                </div>
              </div>

              {/* Comments Thread Section */}
              {showComments && (
                <div className="mt-4 pt-3 border-t border-slate-100 space-y-3">
                  {post.comments.length > 0 ? (
                    <div className="space-y-2">
                      {post.comments.map((comm) => (
                        <div key={comm.id} className="flex gap-2.5 bg-slate-50 p-2.5 rounded-2xl text-xs">
                          <img
                            src={comm.authorAvatar}
                            alt={comm.authorName}
                            className="w-7 h-7 rounded-full object-cover shrink-0"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900">{comm.authorName}</span>
                              <span className="text-[10px] text-slate-400">
                                {new Date(comm.createdAt).toLocaleTimeString('he-IL', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            <p className="text-slate-700 mt-0.5 leading-relaxed">{comm.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 text-center py-2">היו הראשונים להגיב!</p>
                  )}

                  {/* Add comment input */}
                  <form onSubmit={(e) => handleAddComment(post.id, e)} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={commentContent}
                      onChange={(e) => setCommentContent(e.target.value)}
                      placeholder="הוסף תגובה..."
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!commentContent.trim()}
                      className="bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 text-white font-bold px-3 py-2 rounded-xl text-xs transition cursor-pointer"
                    >
                      שלח
                    </button>
                  </form>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
