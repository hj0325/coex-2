'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

export type CanvasPhase = 'idle' | 'transitioning' | 'completed';

interface CanvasBackgroundProps {
  boosted: boolean;
  phase: CanvasPhase;
  popActive: boolean;
  className?: string;
  hideTopBlob?: boolean; // MainPage에서 위쪽 blob을 숨기기 위한 prop
  hideBottomBlob?: boolean; // MainPage에서 하단 blob을 숨기기 위한 prop
  customBottomScale?: number; // MainPage에서 blob 크기를 조정하기 위한 prop
  customTopScale?: number; // MainPage에서 상단 blob 크기를 조정하기 위한 prop
  customCameraFov?: number; // MainPage에서 카메라 FOV를 조정하기 위한 prop
}

type Vector3Tuple = [number, number, number];

export function CanvasBackground({ boosted, phase, popActive, className, hideTopBlob = false, hideBottomBlob = false, customBottomScale, customTopScale, customCameraFov }: CanvasBackgroundProps) {
  const wrapperClassName = [
    'coex-v2-canvas-wrapper',
    phase !== 'idle' ? 'coex-v2-canvas-wrapper--active' : '',
    popActive ? 'coex-v2-canvas-wrapper--pop' : '',
    className ?? ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={wrapperClassName} aria-hidden>
      <Canvas camera={{ position: [0, 0, 6], fov: customCameraFov ?? 50 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.35} />
        <directionalLight position={[4, 6, 8]} intensity={0.8} />
        <Scene boosted={boosted || phase === 'idle'} phase={phase} popActive={popActive} hideTopBlob={hideTopBlob} hideBottomBlob={hideBottomBlob} customBottomScale={customBottomScale} customTopScale={customTopScale} />
      </Canvas>
      <style jsx>{`
        .coex-v2-canvas-wrapper {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
          z-index: 1;
          opacity: 1;
          transition: opacity 900ms ease, filter 1200ms ease;
          filter: saturate(1.22) brightness(1.03);
        }
        .coex-v2-canvas-wrapper--active {
          opacity: 1;
        }
        .coex-v2-canvas-wrapper--pop {
          filter: saturate(1.22) brightness(1.03);
        }
        .coex-v2-canvas-wrapper :global(canvas) {
          width: 100% !important;
          height: 100% !important;
          display: block;
        }
      `}</style>
    </div>
  );
}

interface SceneProps {
  boosted: boolean;
  phase: CanvasPhase;
  popActive: boolean;
  hideTopBlob?: boolean;
  hideBottomBlob?: boolean;
  customBottomScale?: number;
  customTopScale?: number;
}

function Scene({ boosted, phase, popActive, hideTopBlob = false, hideBottomBlob = false, customBottomScale, customTopScale }: SceneProps) {
  const { camera, viewport } = useThree();
  viewport.getCurrentViewport(camera, [0, 0, 0]);
  const spacing = 1.68;

  const topPosition = useMemo<Vector3Tuple>(() => [0, spacing + 0.3, 0], [spacing]);
  const bottomStartPosition = useMemo<Vector3Tuple>(() => [0, -(spacing + 0.3), 0], [spacing]);
  const bottomTargetPosition = useMemo<Vector3Tuple>(
    () => (phase === 'transitioning' || phase === 'completed' ? [0, spacing + 0.3, 0] : [0, -(spacing + 0.3), 0]),
    [phase, spacing]
  );

  // During transition, keep the top blob faintly visible to avoid "empty" frames while the bottom blob moves upward.
  const topOpacityTarget = hideTopBlob ? 0 : (phase === 'transitioning' ? 0.35 : 1);
  const topScaleTarget = customTopScale !== undefined 
    ? customTopScale 
    : (phase === 'transitioning' || phase === 'completed' ? 1.12 : 1);
  const bottomScaleTarget = customBottomScale !== undefined
    ? customBottomScale
    : (popActive ? 2.0 : phase === 'transitioning' ? 1.12 : phase === 'completed' ? 1.04 : 1);
  const bottomPositionLerp = phase === 'transitioning' ? 0.075 : phase === 'completed' ? 0.12 : 0.04;
  const bottomScaleLerp = popActive ? 0.2 : 0.14;
  const bottomVariant = phase === 'transitioning' ? 'water' : 'default';

  return (
    <group position={[0, 0.8, 1]} renderOrder={1000}>
      <AgenticBubble
        boosted={false}
        position={topPosition}
        targetPosition={topPosition}
        variant="default"
        opacityTarget={topOpacityTarget}
        scaleTarget={topScaleTarget}
        positionLerp={0.08}
        opacityLerp={0.06}
        scaleLerp={0.18}
        paletteTarget={0}
        paletteLerp={0.1}
      />
      <AgenticBubble
        boosted={boosted}
        position={bottomStartPosition}
        targetPosition={bottomTargetPosition}
        variant={bottomVariant}
        opacityTarget={hideBottomBlob ? 0 : 1}
        scaleTarget={bottomScaleTarget}
        positionLerp={bottomPositionLerp}
        opacityLerp={0.1}
        scaleLerp={bottomScaleLerp}
        paletteTarget={popActive ? 0.7 : 0.2}
        paletteLerp={0.16}
        breathe={popActive}
      />
    </group>
  );
}

interface AgenticBubbleProps {
  position: Vector3Tuple;
  targetPosition?: Vector3Tuple;
  boosted: boolean;
  variant?: 'default' | 'water';
  opacityTarget?: number;
  scaleTarget?: number;
  positionLerp?: number;
  opacityLerp?: number;
  scaleLerp?: number;
  paletteTarget?: number;
  paletteLerp?: number;
  breathe?: boolean;
}

function AgenticBubble({
  position,
  targetPosition = position,
  boosted,
  variant = 'default',
  opacityTarget = 1,
  scaleTarget = 1,
  positionLerp = 0.08,
  opacityLerp = 0.08,
  scaleLerp = 0.16,
  paletteTarget = 0,
  paletteLerp = 0.12,
  breathe = false
}: AgenticBubbleProps) {
  const material = useMemo<any>(() => {
    return variant === 'water' ? createWaterShaderMaterial() : createDefaultShaderMaterial();
  }, [variant]);

  const meshRef = useRef<any>(null);
  const boostValueRef = useRef(0);
  const opacityRef = useRef(opacityTarget);
  const scaleRef = useRef(scaleTarget);
  const paletteRef = useRef(paletteTarget);
  const targetPositionRef = useRef(new THREE.Vector3(...position));

  useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  useEffect(() => {
    targetPositionRef.current.set(...targetPosition);
  }, [targetPosition]);

  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.position.set(...position);
    }
  }, [position]);

  useFrame((state, delta) => {
    material.uniforms.time.value += delta;
    const boostTarget = boosted ? 1 : 0;
    const boostLerp = boosted ? 0.14 : 0.04;
    boostValueRef.current = THREE.MathUtils.lerp(boostValueRef.current, boostTarget, boostLerp);
    if (material.uniforms.boost != null) {
      material.uniforms.boost.value = boostValueRef.current;
    }

    opacityRef.current = THREE.MathUtils.lerp(opacityRef.current, opacityTarget, opacityLerp);
    if (material.uniforms.globalAlpha != null) {
      material.uniforms.globalAlpha.value = opacityRef.current;
    }

    scaleRef.current = THREE.MathUtils.lerp(scaleRef.current, scaleTarget, scaleLerp);

    paletteRef.current = THREE.MathUtils.lerp(paletteRef.current, paletteTarget, paletteLerp);
    if (material.uniforms.paletteMix != null) {
      material.uniforms.paletteMix.value = paletteRef.current;
    }

    if (meshRef.current) {
      const time = state.clock.getElapsedTime();
      const smoothFreq = breathe ? 0.28 : 0.18;
      const smoothAmp = breathe ? 0.04 : 0.006;
      const breatheFactor = 1 + Math.sin(time * smoothFreq) * smoothAmp;
      meshRef.current.scale.setScalar(scaleRef.current * breatheFactor);
      if (positionLerp > 0) {
        meshRef.current.position.lerp(targetPositionRef.current, positionLerp);
      } else {
        meshRef.current.position.copy(targetPositionRef.current);
      }
    }
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[1.9, 256, 256]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function createDefaultShaderMaterial(): any {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      lightDir: { value: new THREE.Vector3(0.2, 0.9, 0.3).normalize() },
      ringDir: { value: new THREE.Vector3(0.08, 0.56, 0.86).normalize() },
      boost: { value: 0 },
      globalAlpha: { value: 1 },
      paletteMix: { value: 0 }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform float time;
      uniform vec3 lightDir;
      uniform vec3 ringDir;
      uniform float boost;
      uniform float globalAlpha;
      uniform float paletteMix;
      varying vec2 vUv;
      varying vec3 vNormal;
      float hash(vec2 p){ p=fract(p*vec2(123.34,345.45)); p+=dot(p,p+34.345); return fract(p.x*p.y);}
      float n2(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); float a=hash(i); float b=hash(i+vec2(1.0,0.0)); float c=hash(i+vec2(0.0,1.0)); float d=hash(i+vec2(1.0,1.0)); vec2 u=f*f*(3.0-2.0*f); return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);}
      float noise(vec2 p) { return sin(p.x) * cos(p.y) + sin(p.x*2.0)*cos(p.y*2.0)*0.5; }
      float elasticWave(float x, float frequency, float amplitude){ float wave=sin(x*frequency)*amplitude; float decay=exp(-x*0.05); float bounce=sin(x*frequency*2.0)*amplitude*0.3; return (wave+bounce)*decay; }
      float breathingMotion(float time){ float slow=sin(time*0.3)*0.15; float fast=sin(time*0.8)*0.08; float deep=sin(time*0.15)*0.25; return slow+fast+deep; }
      float bumpMove(float c,float w,float f){ float d0=abs(f-(c-1.0)); float d1=abs(f-c); float d2=abs(f-(c+1.0)); float d=min(d0,min(d1,d2)); float aa=fwidth(f)*1.2; return smoothstep(w+aa,0.0+aa,d);}
      vec3 bandWeights(float f){ float width=0.25; float y=bumpMove(0.18,width,f); float p=bumpMove(0.52,width,f); float u=bumpMove(0.86,width,f); return vec3(y,p,u);}
      float softBlur(float x, float strength) {
        return exp(-x * x / strength);
      }
      void main(){
        vec3 N=normalize(vNormal); vec3 L=normalize(lightDir); vec2 p=vUv-0.5; float r=length(p);
        float breathing=breathingMotion(time * 0.32);
        r=r*(1.0+breathing*0.14);
        float topness=clamp(dot(N,normalize(ringDir))*0.5+0.5,0.0,1.0);
        vec3 emerald=vec3(0.04, 0.92, 0.50);
        vec3 neonMint=vec3(0.30, 0.98, 0.75);
        vec3 vividGreen=vec3(0.00, 0.90, 0.35);
        vec3 centerYellow=vec3(1.00, 0.95, 0.45);
        vec3 lavender=vec3(0.90, 0.62, 1.00);
        vec3 deepLavender=vec3(0.60, 0.45, 0.95);
        vec3 base=mix(neonMint,emerald,clamp(0.45+0.55*topness,0.0,1.0));
        base=mix(base,vividGreen,smoothstep(0.12,0.38,topness));
        base=mix(base,lavender,smoothstep(0.0,0.45,1.0-topness));
        base=mix(base,deepLavender,smoothstep(-0.4,0.2,p.y)*0.35);
        vec3 vibrantGreen=vec3(0.18,0.98,0.62);
        vec3 richPurple=vec3(0.52,0.34,0.96);
        vec3 paletteGradient=mix(vibrantGreen, richPurple, smoothstep(-0.2, 0.52, p.y));
        base=mix(base, paletteGradient, paletteMix * 0.6);
        float centerGlow = smoothstep(0.32, 0.05, length(p));
        base = mix(base, centerYellow, centerGlow * 0.48);
        float bottomFactor = 1.0 - smoothstep(-0.45, 0.05, p.y);
        base = mix(base, lavender, bottomFactor * 0.55);
        float loopSec=10.0; float loopT=mod(time,loopSec)/loopSec; float phase=-loopT;
        float boostFactor = 1.0 + boost * 2.6;
        float waveSpeed = mix(1.3, 3.0, boost);
        float waveFreq  = mix(9.5, 18.0, boost);
        float pulse = 0.5 + 0.5 * sin(time * mix(0.55, 1.05, boost));
        pulse = smoothstep(0.25, 0.9, pulse);
        float wave0 = sin(waveFreq * r - waveSpeed * time);
        float wave1 = sin((waveFreq * 1.6) * r - (waveSpeed * 1.2) * time);
        float wave2 = sin((waveFreq * 2.3) * r - (waveSpeed * 1.6) * time + 1.2);
        float radialEnv = smoothstep(0.0, 0.9, r);
        float outwardWave = radialEnv * pulse * (
          mix(0.1, 0.28, boost) * wave0 +
          mix(0.06, 0.18, boost) * wave1 +
          mix(0.04, 0.12, boost) * wave2
        );
        float ripple1=noise(vUv*3.0+time*0.26)*0.02*boostFactor; float ripple2=noise(vUv*5.0+time*0.2)*0.012*boostFactor; float ripple3=noise(vUv*7.0+time*0.4)*0.008*boostFactor; float totalRipple=ripple1+ripple2+ripple3;
        float elastic1=elasticWave(topness*2.0+time*0.32,3.0,0.05*boostFactor); float elastic2=elasticWave(topness*3.0+time*0.52,2.1,0.036*boostFactor); float totalElastic=elastic1+elastic2;
        float blurAmount=0.012; float f1=topness*1.8+phase+totalRipple+totalElastic + outwardWave; float f2=topness*1.8+phase+blurAmount+totalRipple*0.8+totalElastic*0.6 + outwardWave * 0.72; float f3=topness*1.8+phase+(blurAmount*1.5)+totalRipple*0.6+totalElastic*0.4 + outwardWave * 0.45;
        float perturb=0.01*n2(vUv*1.5+time*0.05); vec3 w1=bandWeights(f1+perturb); vec3 w2=bandWeights(f2+perturb*0.8); vec3 w3=bandWeights(f3+perturb*0.6);
        float wobble1=0.995+0.0025*n2(vUv*2.2+time*0.06); float wobble2=0.995+0.0025*n2(vUv*2.2+time*0.06+1.7); float wobble3=0.995+0.0025*n2(vUv*2.2+time*0.06+3.1); w1*=wobble1; w2*=wobble2; w3*=wobble3;
        vec3 cY=vec3(0.03,0.90,0.48); vec3 cP=vec3(0.16,0.97,0.68); vec3 cU=vec3(0.82,0.58,0.98);
        w1*=vec3(0.24,1.08,1.02); w2*=vec3(0.24,1.08,1.02); w3*=vec3(0.24,1.08,1.02);
        vec3 flowColor1=cY*w1.x + cP*w1.y + cU*w1.z; vec3 flowColor2=cY*w2.x + cP*w2.y + cU*w2.z; vec3 flowColor3=cY*w3.x + cP*w3.y + cU*w3.z; vec3 flowColor=(0.5*flowColor1 + 0.35*flowColor2 + 0.15*flowColor3);
        float mask1=clamp(w1.x+w1.y+w1.z,0.0,1.0); float mask2=clamp(w2.x+w2.y+w2.z,0.0,1.0); float mask3=clamp(w3.x+w3.y+w3.z,0.0,1.0); float flowMaskAvg=clamp((0.5*mask1 + 0.35*mask2 + 0.15*mask3),0.0,1.0);
        vec3 lit=base; lit=mix(lit,flowColor,flowMaskAvg*0.4);
        vec3 rippleBase=vec3(0.10,0.96,0.42);
        vec3 rippleAlt=vec3(0.34,0.62,0.98);
        vec3 rippleColor=mix(rippleBase, rippleAlt, paletteMix)*totalRipple*mix(0.38,0.62,boost);
        vec3 elasticBase=vec3(0.62,0.62,0.98);
        vec3 elasticAlt=vec3(0.42,0.58,0.96);
        vec3 elasticColor=mix(elasticBase, elasticAlt, paletteMix)*totalElastic*mix(0.24,0.45,boost);
        lit+=rippleColor+elasticColor;
        vec3 innerGreen=vec3(0.08,0.82,0.46);
        vec3 innerPurple=vec3(0.58,0.42,0.96);
        vec3 edgePurple=vec3(0.36,0.24,0.78);
        lit = mix(lit, mix(vec3(0.05,0.78,0.42), innerGreen, paletteMix), smoothstep(0.0,0.45,length(p))*0.18);
        lit = mix(lit, mix(deepLavender, edgePurple, paletteMix), bottomFactor * 0.32);
        lit = mix(lit, mix(centerYellow, mix(vibrantGreen, innerPurple, 0.42), paletteMix), centerGlow * 0.62);
        vec3 V=vec3(0.0,0.0,1.0);
        float fres=pow(1.0 - max(dot(N,V),0.0), 2.2);
        vec3 rimBase=vec3(0.10,0.85,0.58);
        vec3 rimAlt=vec3(0.32,0.46,0.96);
        vec3 rimGlow=mix(rimBase, rimAlt, paletteMix)*fres*0.46;
        float softHalo=smoothstep(0.42, 0.16, r)*0.12;
        vec3 glow=rimGlow + mix(vec3(0.72,0.58,0.94), vec3(0.46,0.70,0.96), paletteMix)*softHalo;
        lit+=glow;
        vec3 undersideGreen=vec3(0.12,0.94,0.62);
        lit+=mix(vec3(0.05,0.90,0.50), undersideGreen, paletteMix)*(1.0-topness)*mix(0.08,0.22,boost);
        vec3 highlightPurple=vec3(0.62,0.44,0.98);
        lit+=mix(centerYellow, highlightPurple, paletteMix * 0.58) * centerGlow * mix(0.18,0.32,boost);
        vec3 gray=vec3(dot(lit,vec3(0.299,0.587,0.114)));
        float loopPhase = 0.5 + 0.5 * sin(6.28318530718 * time / 7.0);
        float sat = 1.0 + 0.85 * loopPhase;
        lit = mix(gray, lit, sat);
        float brightness = 1.0 + 0.14 * loopPhase;
        lit *= brightness;
        float contrast = 1.0 + 0.32 * loopPhase;
        lit = (lit - 0.5) * contrast + 0.5;
        lit=pow(lit,vec3(0.92)); lit*=mix(1.0,1.05,boost); lit=mix(lit,vec3(1.0),0.02); lit=clamp(lit,0.0,1.0);
        float edgeBase = smoothstep(0.56, 0.32, r);
        float edgeGlow = softBlur(r - 0.4, 0.15);
        float edgeFeather = edgeBase * (1.0 + edgeGlow * 0.3);
        float alpha = 0.88 * edgeFeather + fres * 0.15;
        alpha = alpha * (1.0 - softBlur(r - 0.45, 0.2) * 0.3);
        alpha = clamp(alpha, 0.0, 0.95);
        gl_FragColor=vec4(lit,alpha * globalAlpha);
      }
    `,
    transparent: true
  });
}

function createWaterShaderMaterial(): any {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      lightDir: { value: new THREE.Vector3(0.2, 0.9, 0.3).normalize() },
      ringDir: { value: new THREE.Vector3(0.08, 0.56, 0.86).normalize() },
      boost: { value: 0 },
      globalAlpha: { value: 1 },
      paletteMix: { value: 0 }
    },
    vertexShader: `
      uniform float time;
      uniform float boost;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      float hash(vec2 p){
        p = fract(p*vec2(123.34, 345.45));
        p += dot(p, p+34.345);
        return fract(p.x*p.y);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i+vec2(1.0,0.0));
        float c = hash(i+vec2(0.0,1.0));
        float d = hash(i+vec2(1.0,1.0));
        vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
      }
      float waterDropEffect(vec3 pos, float time) {
        float drop1 = sin(time * 2.0) * 0.3 + 0.5;
        float drop2 = sin(time * 1.7 + 1.5) * 0.25 + 0.5;
        float drop3 = sin(time * 2.3 + 3.1) * 0.2 + 0.5;
        float dist1 = length(pos.xy - vec2(0.2, drop1));
        float dist2 = length(pos.xy - vec2(-0.3, drop2));
        float dist3 = length(pos.xy - vec2(0.4, drop3));
        float ripple1 = sin(dist1 * 20.0 - time * 15.0) * exp(-dist1 * 8.0) * 0.02;
        float ripple2 = sin(dist2 * 18.0 - time * 12.0) * exp(-dist2 * 6.0) * 0.015;
        float ripple3 = sin(dist3 * 22.0 - time * 18.0) * exp(-dist3 * 7.0) * 0.018;
        float shake1 = sin(time * 8.0) * exp(-dist1 * 5.0) * 0.01;
        float shake2 = sin(time * 6.0 + 1.0) * exp(-dist2 * 4.0) * 0.008;
        float shake3 = sin(time * 10.0 + 2.0) * exp(-dist3 * 6.0) * 0.012;
        float intensity = 1.0 + boost * 1.35;
        return (ripple1 + ripple2 + ripple3 + shake1 + shake2 + shake3) * intensity;
      }
      float waterSurfaceDeform(vec3 pos, float time) {
        float wave1 = sin(pos.x * 3.0 + time * 2.0) * cos(pos.y * 2.5 + time * 1.5) * 0.015;
        float wave2 = sin(pos.x * 5.0 + time * 3.0) * cos(pos.y * 4.0 + time * 2.5) * 0.008;
        float wave3 = sin(pos.x * 7.0 + time * 4.0) * cos(pos.y * 6.0 + time * 3.5) * 0.005;
        float noise1 = noise(pos.xy * 2.0 + time * 0.5) * 0.01;
        float noise2 = noise(pos.yz * 1.5 + time * 0.7) * 0.008;
        float noise3 = noise(pos.zx * 2.5 + time * 0.9) * 0.006;
        float surfaceIntensity = 1.0 + boost * 1.1;
        return (wave1 + wave2 + wave3 + noise1 + noise2 + noise3) * surfaceIntensity;
      }
      void main() {
        vUv = uv;
        vec3 pos = position;
        float dropEffect = waterDropEffect(pos, time);
        pos += normal * dropEffect;
        float surfaceDeform = waterSurfaceDeform(pos, time);
        pos += normal * surfaceDeform;
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform float time;
      uniform float boost;
      uniform vec3 lightDir;
      uniform vec3 ringDir;
      uniform float globalAlpha;
      uniform float paletteMix;
      varying vec2 vUv;
      varying vec3 vNormal;
      float hash(vec2 p){ p = fract(p*vec2(123.34,345.45)); p += dot(p,p+34.345); return fract(p.x*p.y);}
      float n2(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); float a=hash(i); float b=hash(i+vec2(1.0,0.0)); float c=hash(i+vec2(0.0,1.0)); float d=hash(i+vec2(1.0,1.0)); vec2 u=f*f*(3.0-2.0*f); return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);}
      float noise(vec2 p) { return sin(p.x) * cos(p.y) + sin(p.x*2.0)*cos(p.y*2.0)*0.5; }
      float elasticWave(float x, float frequency, float amplitude){ float wave=sin(x*frequency)*amplitude; float decay=exp(-x*0.05); float bounce=sin(x*frequency*2.0)*amplitude*0.3; return (wave+bounce)*decay; }
      float bumpMove(float c,float w,float f){ float d0=abs(f-(c-1.0)); float d1=abs(f-c); float d2=abs(f-(c+1.0)); float d=min(d0,min(d1,d2)); float aa=fwidth(f)*1.2; return smoothstep(w+aa,0.0+aa,d);}
      vec3 bandWeights(float f){ float width=0.24; float y=bumpMove(0.18,width,f); float p=bumpMove(0.52,width,f); float u=bumpMove(0.86,width,f); return vec3(y,p,u);}
      float softBlur(float x, float strength) { return exp(-x * x / strength); }
      void main(){
        vec3 N=normalize(vNormal);
        vec3 L=normalize(lightDir);
        vec2 p = vUv - 0.5;
        float r=length(p);
        float topness=clamp(dot(N,normalize(ringDir))*0.5+0.5,0.0,1.0);
        vec3 emerald=vec3(0.04, 0.92, 0.50);
        vec3 neonMint=vec3(0.30, 0.98, 0.75);
        vec3 vividGreen=vec3(0.00, 0.90, 0.35);
        vec3 centerYellow=vec3(1.00, 0.95, 0.45);
        vec3 lavender=vec3(0.90, 0.62, 1.00);
        vec3 deepLavender=vec3(0.60, 0.45, 0.95);
        vec3 base=mix(neonMint,emerald,clamp(0.4+0.6*topness,0.0,1.0));
        base=mix(base,vividGreen,smoothstep(0.1,0.36,topness));
        base=mix(base,lavender,smoothstep(0.0,0.55,1.0-topness));
        base=mix(base,deepLavender,smoothstep(-0.36,0.2,p.y)*0.42);
        float loopSec=12.0; float loopT=mod(time,loopSec)/loopSec; float phase=-loopT;
        float rippleIntensity = 1.0 + boost * 1.25;
        float drop1=sin(time*2.0)*0.3+0.5; float drop2=sin(time*1.7+1.5)*0.25+0.5; float drop3=sin(time*2.3+3.1)*0.2+0.5;
        float dist1=length(vUv-vec2(0.2,drop1)); float dist2=length(vUv-vec2(-0.3,drop2)); float dist3=length(vUv-vec2(0.4,drop3));
        float ripple1=sin(dist1*18.0-time*8.4)*exp(-dist1*7.5)*0.08*rippleIntensity;
        float ripple2=sin(dist2*16.0-time*7.2)*exp(-dist2*5.8)*0.06*rippleIntensity;
        float ripple3=sin(dist3*19.0-time*9.6)*exp(-dist3*6.4)*0.075*rippleIntensity;
        float totalRipple=ripple1+ripple2+ripple3;
        float elastic1=elasticWave(topness*2.0+time*0.38,3.0,0.12);
        float elastic2=elasticWave(topness*3.0+time*0.62,2.2,0.07);
        float totalElastic=(elastic1+elastic2) * (1.0 + boost * 0.85);
        float blurAmount=0.012;
        float f1=topness*1.8+phase+totalRipple+totalElastic;
        float f2=topness*1.8+phase+blurAmount+totalRipple*0.82+totalElastic*0.64;
        float f3=topness*1.8+phase+(blurAmount*1.5)+totalRipple*0.6+totalElastic*0.4;
        float perturb=0.02*n2(vUv*1.5+time*0.05);
        vec3 w1=bandWeights(f1+perturb);
        vec3 w2=bandWeights(f2+perturb*0.8);
        vec3 w3=bandWeights(f3+perturb*0.6);
        float wobble1=0.996+0.0025*n2(vUv*2.2+time*0.05+1.0);
        float wobble2=0.996+0.0025*n2(vUv*2.2+time*0.05+2.4);
        float wobble3=0.996+0.0025*n2(vUv*2.2+time*0.05+3.7);
        w1*=wobble1; w2*=wobble2; w3*=wobble3;
        vec3 cY=vec3(0.10,0.92,0.58);
        vec3 cP=vec3(0.22,0.96,0.70);
        vec3 cU=vec3(0.66,0.50,0.98);
        w1*=vec3(0.22,1.10,1.05);
        w2*=vec3(0.22,1.10,1.05);
        w3*=vec3(0.22,1.10,1.05);
        vec3 flowColor1=cY*w1.x + cP*w1.y + cU*w1.z;
        vec3 flowColor2=cY*w2.x + cP*w2.y + cU*w2.z;
        vec3 flowColor3=cY*w3.x + cP*w3.y + cU*w3.z;
        vec3 flowColor=(0.5*flowColor1 + 0.35*flowColor2 + 0.15*flowColor3);
        float mask1=clamp(w1.x+w1.y+w1.z,0.0,1.0);
        float mask2=clamp(w2.x+w2.y+w2.z,0.0,1.0);
        float mask3=clamp(w3.x+w3.y+w3.z,0.0,1.0);
        float flowMaskAvg=clamp((0.5*mask1 + 0.35*mask2 + 0.15*mask3),0.0,1.0);
        vec3 lit=base;
        lit=mix(lit,flowColor,flowMaskAvg*mix(0.32,0.58,boost));
        vec3 rippleColor=vec3(0.10,0.98,0.52)*totalRipple*mix(0.18,0.36,boost);
        vec3 elasticColor=vec3(0.58,0.60,0.96)*totalElastic*mix(0.14,0.28,boost);
        lit+=rippleColor+elasticColor;
        float centerGlow = smoothstep(0.34, 0.08, r);
        lit = mix(lit, centerYellow, centerGlow * mix(0.35,0.58,boost));
        vec3 paletteTint = mix(vec3(0.18,0.96,0.66), vec3(0.48,0.44,0.98), paletteMix);
        lit = mix(lit, paletteTint, paletteMix * 0.28);
        vec3 V=vec3(0.0,0.0,1.0);
        float fres=pow(1.0 - max(dot(N,V),0.0), 2.4);
        vec3 rimGlow=vec3(0.18,0.88,0.64)*fres*mix(0.22,0.42,boost);
        float softHalo=smoothstep(0.38, 0.14, r)*0.12;
        vec3 glow=rimGlow + vec3(0.68,0.54,0.96)*softHalo;
        lit+=glow;
        lit+=vec3(0.08,0.94,0.60)*(1.0-topness)*mix(0.12,0.22,boost);
        vec3 gray=vec3(dot(lit,vec3(0.299,0.587,0.114)));
        float loopPhase = 0.5 + 0.5 * sin(6.28318530718 * time / 9.5);
        float sat = 1.0 + 0.6 * loopPhase;
        lit = mix(gray, lit, sat);
        float brightness = 1.0 + 0.1 * loopPhase;
        lit *= brightness;
        float contrast = 1.0 + 0.2 * loopPhase;
        lit = (lit - 0.5) * contrast + 0.5;
        lit=pow(lit,vec3(0.92));
        lit*=1.04;
        lit=mix(lit,vec3(1.0),0.015);
        lit=clamp(lit,0.0,1.0);
        float edgeBase = smoothstep(0.54, 0.30, r);
        float edgeGlow = softBlur(r - 0.36, 0.18);
        float edgeFeather = edgeBase * (1.0 + edgeGlow * 0.22);
        float alpha = 0.8 * edgeFeather + fres * 0.16;
        alpha = clamp(alpha, 0.0, 0.95);
        gl_FragColor=vec4(lit,alpha * globalAlpha);
      }
    `,
    transparent: true
  });
}

