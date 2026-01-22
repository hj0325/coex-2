'use client';

import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import BlobBackground from './ui/BlobBackground';
import { useSoundManager } from '@/hooks/useSoundManager';

// 동적 import로 페이지 컴포넌트들을 지연 로드 (초기 번들 크기 감소)
const LandingPage = lazy(() => import('./LandingPage'));
const LandingPageV2 = lazy(() => import('./LandingPageV2'));
const OnboardingPage = lazy(() => import('./OnboardingPage'));
const MainPage = lazy(() => import('./MainPage'));
// Preload helper to avoid Suspense fallback blank during landing->main transition
const preloadMainPage = () => import('./MainPage');

type PageType = 'landing' | 'onboarding' | 'main' | 'blocked';

interface EnterResponse {
  allowed: boolean;
  reason?: 'DAILY_LIMIT' | 'CONCURRENCY_LIMIT' | 'ONCE_PER_DAY' | 'SERVER_ERROR';
  message?: string;
  total?: number;
  concurrentUsers?: number;
}

export default function AppFlow() {
  const [currentPage, setCurrentPage] = useState<PageType>('landing');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [blobAnimating, setBlobAnimating] = useState(false);
  const [showBlobBackground] = useState(true);
  const [accessStatus, setAccessStatus] = useState<EnterResponse | null>(null);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [selectedOnboardingOption, setSelectedOnboardingOption] = useState<string | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const leaveHandlerRef = useRef<(() => void) | null>(null);
  // 사전 로드 제거: 필요할 때만 로드 (지연 로드)
  // MainPage로 전환될 때만 사운드 매니저 초기화 (초기 로딩 최적화)
  const { playSound } = useSoundManager();

  const handleLandingComplete = useCallback((selectedOption: string) => {
    setSelectedOnboardingOption(selectedOption);
    // blob 애니메이션이 보이도록 fade 효과 제거
    setIsTransitioning(false);
    // 4. LandingPage -> MainPage 전환 시 화면 전환 사운드 재생
    playSound('SCREEN_TRANSITION', {
      onError: () => {
        // 재생 실패해도 조용히 처리
      },
    }).catch(() => {
      // 재생 실패해도 조용히 처리
    });
    setCurrentPage('main');
  }, [playSound]);

  const handleLandingOptionSelected = useCallback((selectedOption: string) => {
    setSelectedOnboardingOption(selectedOption);
    setBlobAnimating(true);
    // Preload main chunk early so we don't flash the "로딩 중..." fallback when switching pages.
    preloadMainPage().catch(() => {
      // ignore preload errors; fallback will handle
    });
  }, []);

  const handleBlobAnimationStart = () => {
    setBlobAnimating(true);
  };

  const handleBlobAnimationComplete = () => {
    // 필요시 구현
  };

  // 페이지 진입 시 접속 체크
  useEffect(() => {
    let isMounted = true;
    let safetyTimeout: NodeJS.Timeout | null = null;

    const checkAccess = async () => {
      try {
        if (!isMounted) return;
        setIsCheckingAccess(true);
        
        // 타임아웃 설정 (1.5초로 단축 - 더 빠른 fallback)
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), 1500);
        });
        
        const fetchPromise = fetch('/api/enter', {
          method: 'GET',
          cache: 'no-store',
        });
        
        const response = await Promise.race([fetchPromise, timeoutPromise]);
        
        if (!isMounted) return;
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data: EnterResponse = await response.json();
        
        if (!isMounted) return;
        
        setAccessStatus(data);
        
        if (!data.allowed) {
          setCurrentPage('blocked');
          setIsCheckingAccess(false);
          return;
        }
        
        setIsCheckingAccess(false);
        setCurrentPage('landing');
      } catch (error) {
        console.error('[AppFlow] 접속 체크 실패:', error);
        
        if (!isMounted) return;
        
        // 에러 발생 시 기본적으로 LandingPage를 보여줌
        // (접속 제어 기능이 작동하지 않아도 서비스는 이용 가능)
        setAccessStatus({
          allowed: true, // 기본적으로 허용
          reason: undefined,
          message: undefined
        });
        setIsCheckingAccess(false);
        setCurrentPage('landing');
      }
    };

    // 안전장치: 2초 후에도 로딩 중이면 강제로 LandingPage 표시 (더 빠른 fallback)
    safetyTimeout = setTimeout(() => {
      if (isMounted) {
        setIsCheckingAccess(false);
        setCurrentPage('landing');
        setAccessStatus({
          allowed: true,
          reason: undefined,
          message: undefined
        });
      }
    }, 2000);

    checkAccess();

    return () => {
      isMounted = false;
      if (safetyTimeout) {
        clearTimeout(safetyTimeout);
      }
    };
  }, []);

  // MainPage로 전환 시 heartbeat 시작
  useEffect(() => {
    if (currentPage === 'main') {
      // 쿠키에서 session_id 확인하는 헬퍼 함수
      const getCookie = (name: string): string | null => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
        return null;
      };

      // 즉시 한 번 heartbeat 전송
      const sendHeartbeat = async () => {
        try {
          // session_id 쿠키가 있는지 확인
          const sessionId = getCookie('session_id');
          if (!sessionId) {
            // 쿠키가 없으면 조용히 실패 (에러 로그 없음)
            return;
          }

          const response = await fetch('/api/heartbeat', { method: 'POST' });
          
          // 400 에러는 session_id가 없는 경우이므로 조용히 처리
          if (!response.ok && response.status === 400) {
            // 조용히 실패 (에러 로그 없음)
            return;
          }
          
          if (!response.ok) {
            console.warn('Heartbeat failed with status:', response.status);
          }
        } catch (error) {
          // 네트워크 에러 등만 로그 출력
          console.error('Heartbeat network error:', error);
        }
      };
      
      // 약간의 지연 후 heartbeat 전송 (쿠키 설정 시간 확보)
      setTimeout(() => {
        sendHeartbeat();
      }, 500);

      // 30초마다 heartbeat 전송
      heartbeatIntervalRef.current = setInterval(() => {
        sendHeartbeat();
      }, 30000);

      // 페이지 언로드 시 세션 정리
      const handleBeforeUnload = async () => {
        try {
          await fetch('/api/leave', { method: 'POST' });
        } catch (error) {
          console.error('Leave failed:', error);
        }
      };

      // visibilitychange 이벤트로 탭 전환 감지
      const handleVisibilityChange = () => {
        if (!document.hidden) {
          sendHeartbeat();
        }
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      leaveHandlerRef.current = () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (leaveHandlerRef.current) {
        leaveHandlerRef.current();
        leaveHandlerRef.current = null;
      }
    };
  }, [currentPage]);


  const renderCurrentPage = () => {
    if (isCheckingAccess) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-transparent relative" style={{ zIndex: 10 }}>
          <div className="text-center">
            <div className="text-gray-800 mb-4" style={{ fontFamily: 'Pretendard Variable', fontSize: '16px', fontWeight: 500 }}>
              접속 확인 중...
            </div>
            <div className="text-gray-600 text-sm" style={{ fontFamily: 'Pretendard Variable' }}>
              잠시만 기다려주세요
            </div>
          </div>
        </div>
      );
    }

    try {
      switch (currentPage) {
      case 'blocked':
        return (
          <div className="fixed inset-0 flex items-center justify-center px-6" style={{ zIndex: 10 }}>
            <div className="text-center max-w-md">
              {accessStatus?.reason === 'ONCE_PER_DAY' ? (
                <>
                  {/* 제목 문구 */}
                  <div 
                    style={{ 
                      color: '#000',
                      textAlign: 'center',
                      fontFamily: 'Pretendard Variable',
                      fontSize: '20px',
                      fontStyle: 'normal',
                      fontWeight: 400,
                      lineHeight: '130%',
                      letterSpacing: '-0.432px',
                      whiteSpace: 'pre-line',
                      marginBottom: '16px'
                    }}
                  >
                    아쉽지만 오늘의 대화는 여기까지예요.{'\n'}다음에 또 이야기해요!
                  </div>
                  {/* 본문 문구 */}
                  <div 
                    style={{ 
                      color: '#000',
                      textAlign: 'center',
                      fontFamily: 'Pretendard Variable',
                      fontSize: '16px',
                      fontStyle: 'normal',
                      fontWeight: 400,
                      lineHeight: '130%',
                      letterSpacing: '-0.432px'
                    }}
                  >
                    하루에 한 번만 대화할 수 있어요.
                  </div>
                </>
              ) : (
                <>
                  <div className="text-gray-800 mb-4" style={{ fontFamily: 'Pretendard Variable', fontSize: '20px', fontWeight: 600 }}>
                    {accessStatus?.message || '접속이 제한되었습니다.'}
                  </div>
                  {accessStatus?.reason === 'DAILY_LIMIT' && (
                    <div className="text-gray-600 text-sm" style={{ fontFamily: 'Pretendard Variable' }}>
                      오늘의 이용 인원이 모두 찼습니다. 내일 다시 이용해 주세요.
                    </div>
                  )}
                  {accessStatus?.reason === 'CONCURRENCY_LIMIT' && (
                    <div className="text-gray-600 text-sm" style={{ fontFamily: 'Pretendard Variable' }}>
                      현재 접속이 많습니다. 잠시 후 다시 시도해 주세요.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        );
      case 'landing':
        return (
          <div className="relative" style={{ zIndex: 10 }}>
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-gray-600">로딩 중...</div></div>}>
              <LandingPageV2 
                onComplete={handleLandingComplete} 
                onSelectOption={handleLandingOptionSelected}
                showBlob={false} 
              />
            </Suspense>
          </div>
        );
      case 'main':
        return (
          <div 
            className="relative"
            style={{ 
              zIndex: 10,
            }}
          >
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-gray-600">로딩 중...</div></div>}>
              <MainPage showBlob={true} selectedOnboardingOption={selectedOnboardingOption} />
            </Suspense>
          </div>
        );
      default:
        return (
          <div className="relative" style={{ zIndex: 10 }}>
            <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-gray-600">로딩 중...</div></div>}>
              <LandingPageV2 
                onComplete={handleLandingComplete} 
                onSelectOption={handleLandingOptionSelected}
                showBlob={false} 
              />
            </Suspense>
          </div>
        );
      }
    } catch (error) {
      console.error('Error rendering page:', error);
      return (
        <div className="min-h-screen flex items-center justify-center bg-transparent relative" style={{ zIndex: 10 }}>
          <div className="text-center">
            <div className="text-gray-800 mb-4" style={{ fontFamily: 'Pretendard Variable', fontSize: '16px', fontWeight: 500 }}>
              페이지를 불러오는 중 오류가 발생했습니다.
            </div>
            <div className="text-gray-600 text-sm" style={{ fontFamily: 'Pretendard Variable' }}>
              브라우저 콘솔을 확인해주세요.
            </div>
            <button
              onClick={() => {
                setCurrentPage('landing');
                setIsCheckingAccess(false);
              }}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              style={{ fontFamily: 'Pretendard Variable' }}
            >
              다시 시도
            </button>
          </div>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen relative" style={{ background: 'radial-gradient(circle at 30% 25%, #fdf0f6 0%, #fce6ef 45%, #f7d7e4 100%)' }}>
      {/* MainPage에서는 BlobBackground를 렌더링하지 않음 (MainPage 내부에서 자체 blob 사용) */}
      {showBlobBackground && currentPage !== 'main' && (
        <div 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            zIndex: 0, 
            pointerEvents: 'none',
            isolation: 'isolate'
          }}
        >
          <BlobBackground
            isAnimating={blobAnimating}
            onAnimationComplete={handleBlobAnimationComplete}
          />
        </div>
      )}
      <div 
        className="relative" 
        style={{ 
          minHeight: '100vh', 
          width: '100%', 
          zIndex: 10, 
          position: 'relative',
          isolation: 'isolate'
        }}
      >
        {renderCurrentPage()}
      </div>
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

