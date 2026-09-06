const SUN_SCALE = .1;
const SUN_ATTRACT_MIN_SQ = 100000;
const SUN_ATTRACT_MAX_SQ = 1000000;
const SUN_ATTRACT_G = .007;
const SUN_INFLUENCE_RADIUS = 1000;
const SUN_MAX_RADIUS = 100;
const SUN_MIN_RADIUS = 100;
const SUN_FADE_MS = 10000;
const SUN_SCALE_LERP = 0.001;
const SUN_ALPHA_LERP = 0.008;
const TRAIL_NOISE_TIME_SCALE = 0.014;
const TRAIL_NOISE_SPATIAL_SCALE = 0.009;
const TRAIL_NOISE_WEIGHT_MIN = 18;
const TRAIL_NOISE_WEIGHT_MAX = 220;
const TRAIL_NOISE_ALPHA_MIN = 0.8;
const TRAIL_NOISE_ALPHA_MAX = 14;
const TRAIL_EDGE_NOISE_TIME_MULT = 1.8;
const TRAIL_EDGE_OFFSET_MIN = 0.35;
const TRAIL_EDGE_OFFSET_MAX = 1.1;
const TRAIL_CORE_WEIGHT_FACTOR = 0.74;
const TRAIL_EDGE_WEIGHT_FACTOR = 0.3;
const VELA_EDGE_FADE_DISTANCE = 520;
const VELA_ALPHA_LERP = 0.12;
const GLASS_SPRITES = new Map();

function glassSprite(color,specular = .5,lightColor = null) {
  const band = constrain(Math.round(specular * 4),0,4);
  const lightKey = lightColor ? lightColor.join('-') : 'neutral';
  const key = `${color.join('-')}-${band}-${lightKey}`;
  if (GLASS_SPRITES.has(key)) return GLASS_SPRITES.get(key);
  const sprite = document.createElement('canvas');
  sprite.width = 96; sprite.height = 96;
  const context = sprite.getContext('2d');
  const [r,g,b] = color;
  const light = lightColor || [255,255,255];
  const body = context.createRadialGradient(38,32,2,48,48,45);
  body.addColorStop(0,`rgba(${light[0]},${light[1]},${light[2]},${.52 + band * .075})`);
  body.addColorStop(.18,`rgba(${r},${g},${b},${.78 + band * .035})`);
  body.addColorStop(.62,`rgba(${r},${g},${b},.68)`);
  body.addColorStop(.88,'rgba(0,0,0,.82)');
  body.addColorStop(1,'rgba(0,0,0,0)');
  context.fillStyle = body; context.fillRect(0,0,96,96);
  const glintX = 27 + band * 2.4; const glintY = 31 - band * 1.7;
  const glint = context.createRadialGradient(glintX,glintY,0,glintX,glintY,14 + band);
  glint.addColorStop(0,`rgba(${light[0]},${light[1]},${light[2]},${.18 + band * .08})`);
  glint.addColorStop(1,'rgba(255,255,255,0)');
  context.fillStyle = glint; context.fillRect(0,0,96,96);
  GLASS_SPRITES.set(key,sprite);
  return sprite;
}

function drawGlassParticle(context,color,x,y,diameter,alpha,specular = .5,lightColor = null) {
  const drawingContext = context.drawingContext;
  if (!drawingContext) return;
  drawingContext.save();
  drawingContext.globalAlpha = constrain(alpha / 255,0,1);
  drawingContext.translate(x,y);
  drawingContext.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},.72)`;
  drawingContext.fillRect(-diameter / 2,-diameter / 2,diameter,diameter);
  drawingContext.drawImage(glassSprite(color,specular,lightColor),-diameter / 2,-diameter / 2,diameter,diameter);
  drawingContext.restore();
}

function refractThroughSubstrate(point,layer = 1) {
  const settings = window.OVEL_SETTINGS;
  if (!settings.substrateRefractionEnabled) return point;
  const scars = window.OVEL_SCAR_REGIONS || [];
  let x = point.x; let y = point.y;
  const radius = Math.hypot(width,height) * settings.substrateRefractionRadius;
  const dispersion = settings.substrateDispersion[layer] || 0;
  for (const scar of scars) {
    const sx = scar.x * width; const sy = scar.y * height;
    const dx = point.x - sx; const dy = point.y - sy;
    const distance = Math.hypot(dx,dy);
    if (distance < .001 || distance > radius * 2.4) continue;
    const falloff = Math.exp(-(distance * distance) / (radius * radius));
    const bend = settings.substrateRefractionStrength * scar.density * falloff;
    const nx = dx / distance; const ny = dy / distance;
    x += nx * bend - ny * bend * dispersion;
    y += ny * bend + nx * bend * dispersion;
  }
  const core = window.OVEL_CORE_STATE;
  if (settings.eventHorizonLensingEnabled && core) {
    const dx = x - core.x; const dy = y - core.y;
    const distance = Math.hypot(dx,dy);
    const membraneRadius = min(width,height) * (settings.portalMembraneRadius || 0);
    const outerRadius = max(core.r * settings.eventHorizonRadius,membraneRadius);
    if (distance > core.r * .92 && distance < outerRadius) {
      const proximity = constrain((outerRadius - distance) / max(1,outerRadius - core.r),0,1);
      const angle = settings.eventHorizonBend * proximity * proximity
        + (settings.eventHorizonDispersion[layer] || 0) * proximity;
      const compressedRadius = distance + core.r * settings.eventHorizonCompression * proximity;
      const baseAngle = Math.atan2(dy,dx) + angle;
      x = core.x + Math.cos(baseAngle) * compressedRadius;
      y = core.y + Math.sin(baseAngle) * compressedRadius;
    }
    if (settings.portalMembraneEnabled && membraneRadius > 0) {
      const mdx = x - core.x; const mdy = y - core.y;
      const membraneDistance = Math.hypot(mdx,mdy);
      const thickness = max(1,membraneRadius * settings.portalMembraneThickness);
      const signedDistance = (membraneDistance - membraneRadius) / thickness;
      const envelope = Math.exp(-signedDistance * signedDistance * 1.7);
      const phase = signedDistance * settings.portalTextureFrequency * Math.PI + frameCount * settings.portalTextureRate + layer * .41;
      const displacement = Math.sin(phase) * settings.portalTextureStrength * envelope;
      if (membraneDistance > .001) {
        x += mdx / membraneDistance * displacement;
        y += mdy / membraneDistance * displacement;
      }
    }
  }
  return { x,y };
}

class Vela {
  constructor(x, y, vx, vy, m, isSun = false) {
    this.pos = createVector(x, y);
    this.prev = this.pos.copy();
    this.positionHistory = Array.from({ length:16 },() => this.pos.copy());
    this.vel = createVector(vx, vy);
    this.acc = createVector(0, 0);
    this.trailBend = createVector(0,0);
    this.bendHistory = Array.from({ length:16 },() => createVector(0,0));
    this.velocityHistory = Array.from({ length:16 },() => this.vel.copy());
    this.baseMass = m;
    this.mass = m;
    this.baseR = sqrt(this.baseMass) * (isSun ? SUN_SCALE : 1);
    this.r = this.baseR;
    this.isSun = isSun;
    this.swell = 0;
    this.massSwell = 0;
    this.influencedThisFrame = false;
    this.wasInfluenced = false;
    this.exitStartMs = 0;
    this.exitStartR = this.r;
    this.exitStartMass = this.mass;
    this.sunAlpha = 255;
    this.noiseSeed = random(10000);
    this.surfaceSpecular = .12 + noise(this.noiseSeed * .017) * .68;
    this.edgePhase = noise(this.noiseSeed * .031) * TWO_PI;
    this.visibilityAlpha = 255;
  }

  beginSwell() {
    if (!this.isSun) return;
    this.swell = 0;
    this.massSwell = 0;
    this.influencedThisFrame = false;
  }

  applyForce(force) {
    let f = p5.Vector.div(force, this.mass);
    this.acc.add(f);
  }

  attract(vela) {
    const settings = window.OVEL_SETTINGS;
    let force = p5.Vector.sub(this.pos, vela.pos);
    let rawDistanceSq = force.magSq();
    let distanceSq = constrain(rawDistanceSq,settings.sunAttractMinSq,settings.sunAttractMaxSq);
    let strength = ((this.mass * vela.mass) / distanceSq) * settings.sunAttractG;
    force.setMag(strength);
    vela.applyForce(force);

    if (this.isSun) {
      let d = sqrt(rawDistanceSq);
      let t = 1 - d / settings.sunInfluenceRadius;
      t = constrain(t, 0, 1);
      if (t > 0) {
        this.swell += vela.mass;
        this.massSwell += vela.mass;
        this.influencedThisFrame = true;
      }
    }
  }


  applySwell() {
    if (!this.isSun) return;
    const settings = window.OVEL_SETTINGS;
    if (this.influencedThisFrame) {
      this.mass = this.baseMass + this.massSwell;
      const targetR = min(this.baseR + this.swell,settings.sunMaxRadius);
      this.r = lerp(this.r,targetR,settings.sunScaleLerp);
      this.sunAlpha = lerp(this.sunAlpha,255,settings.sunAlphaLerp);
      this.wasInfluenced = true;
    } else {
      if (this.wasInfluenced) {
        this.exitStartMs = millis();
        this.exitStartR = this.r;
        this.exitStartMass = this.mass;
        this.wasInfluenced = false;
      }
      let t = constrain((millis() - this.exitStartMs) / settings.sunFadeMs, 0, 1);
      let ease = 1 - pow(1 - t, 3);
      this.sunAlpha = lerp(255, 0, ease);
      this.r = lerp(this.exitStartR,settings.sunMinRadius,ease);
    }
  }


  update() {
    const settings = window.OVEL_SETTINGS;
    if (settings.spectralBendEnabled && !this.isSun) {
      const targetBend = this.acc.copy().mult(-settings.spectralBendResistance).limit(settings.spectralBendLimit);
      this.trailBend.lerp(targetBend,settings.spectralBendResponse).limit(settings.spectralBendLimit);
    } else this.trailBend.mult(.72);
    this.prev.set(this.pos);
    this.vel.add(this.acc);
    this.pos.add(this.vel);
    this.positionHistory.unshift(this.pos.copy());
    if (this.positionHistory.length > 16) this.positionHistory.pop();
    this.bendHistory.unshift(this.trailBend.copy());
    if (this.bendHistory.length > 16) this.bendHistory.pop();
    this.velocityHistory.unshift(this.vel.copy());
    if (this.velocityHistory.length > 16) this.velocityHistory.pop();
    this.acc.set(0, 0);
    if (!this.isSun) {
      const targetAlpha = this.computeVisibilityAlpha();
      this.visibilityAlpha = lerp(this.visibilityAlpha, targetAlpha, VELA_ALPHA_LERP);
    }
  }

  computeVisibilityAlpha() {
    const settings = window.OVEL_SETTINGS;
    const composition = window.OVEL_VIEWPORT_METRICS ? window.OVEL_VIEWPORT_METRICS() : { edgeFade:settings.edgeFadeDistance };
    const edgeDistance = min(this.pos.x, width - this.pos.x, this.pos.y, height - this.pos.y);
    const visibleFactor = constrain(edgeDistance / composition.edgeFade, 0, 1);
    return 255 * visibleFactor;
  }


  showTrail(renderer = null, scale = 1, sceneW = width, sceneH = height) {
    const settings = window.OVEL_SETTINGS;
    const composition = window.OVEL_VIEWPORT_METRICS ? window.OVEL_VIEWPORT_METRICS() : { lineScale:1,alphaGain:1 };
    if (abs(this.pos.x - this.prev.x) > sceneW / 2) return;
    if (abs(this.pos.y - this.prev.y) > sceneH / 2) return;
    const segX = this.pos.x - this.prev.x;
    const segY = this.pos.y - this.prev.y;
    const segLen = sqrt(segX * segX + segY * segY);
    if (segLen < 0.0001) return;
    const nx = -segY / segLen;
    const ny = segX / segLen;

    const n = noise(
      this.noiseSeed + this.pos.x * TRAIL_NOISE_SPATIAL_SCALE,
      this.noiseSeed + this.pos.y * TRAIL_NOISE_SPATIAL_SCALE,
      frameCount * settings.trailNoiseTimeScale
    );
    const shapedNoise = pow(n, 0.45);
    const dynamicWeight = lerp(settings.trailWeightMin,settings.trailWeightMax,shapedNoise);
    const dynamicAlpha = lerp(settings.trailAlphaMin,settings.trailAlphaMax,shapedNoise);
    const edgeNoiseA = noise(
      this.noiseSeed + 113 + this.pos.x * TRAIL_NOISE_SPATIAL_SCALE,
      this.noiseSeed + 227 + this.pos.y * TRAIL_NOISE_SPATIAL_SCALE,
      frameCount * TRAIL_NOISE_TIME_SCALE * TRAIL_EDGE_NOISE_TIME_MULT
    );
    const edgeNoiseB = noise(
      this.noiseSeed + 337 + this.pos.x * TRAIL_NOISE_SPATIAL_SCALE,
      this.noiseSeed + 443 + this.pos.y * TRAIL_NOISE_SPATIAL_SCALE,
      frameCount * TRAIL_NOISE_TIME_SCALE * TRAIL_EDGE_NOISE_TIME_MULT
    );
    const edgeOffsetA = dynamicWeight * lerp(TRAIL_EDGE_OFFSET_MIN, TRAIL_EDGE_OFFSET_MAX, pow(edgeNoiseA, 0.8));
    const edgeOffsetB = dynamicWeight * lerp(TRAIL_EDGE_OFFSET_MIN, TRAIL_EDGE_OFFSET_MAX, pow(edgeNoiseB, 0.8));
    const coreWeight = dynamicWeight * TRAIL_CORE_WEIGHT_FACTOR;
    const edgeWeight = max(1, dynamicWeight * TRAIL_EDGE_WEIGHT_FACTOR);
    const visibilityFactor = this.isSun ? 1 : this.visibilityAlpha / 255;
    const coreAlpha = dynamicAlpha * 0.45 * visibilityFactor * composition.alphaGain;
    const edgeAlphaA = dynamicAlpha * lerp(0.35, 1, edgeNoiseA) * visibilityFactor * composition.alphaGain;
    const edgeAlphaB = dynamicAlpha * lerp(0.35, 1, edgeNoiseB) * visibilityFactor * composition.alphaGain;
    if (coreAlpha < 0.01 && edgeAlphaA < 0.01 && edgeAlphaB < 0.01) return;

    if (settings.spectralEnabled && !this.isSun) {
      const colors = settings.spectralColors;
      const lags = settings.spectralFrameOffsets;
      const context = renderer || window;
      const trace = (from,to,bend,layer) => {
        if (!settings.spectralBendEnabled || !bend) {
          context.line(from.x * scale,from.y * scale,to.x * scale,to.y * scale); return;
        }
        const dx = to.x - from.x; const dy = to.y - from.y;
        const length = Math.hypot(dx,dy);
        if (length > settings.spectralBendMaxLength) return;
        const nx = length > .001 ? -dy / length : 0;
        const ny = length > .001 ? dx / length : 0;
        const layerCenter = (lags.length - 1) * .5;
        const angle = (layer - layerCenter) * .24;
        const cosAngle = Math.cos(angle); const sinAngle = Math.sin(angle);
        const spread = 1.35 + abs(layer - layerCenter) * .2;
        const bx = (bend.x * cosAngle - bend.y * sinAngle) * spread;
        const by = (bend.x * sinAngle + bend.y * cosAngle) * spread;
        const separation = (layer - layerCenter) * settings.spectralBendSeparation * .72;
        const ox = nx * separation; const oy = ny * separation;
        const cx = ((from.x + to.x) * .5 + bx + ox) * scale;
        const cy = ((from.y + to.y) * .5 + by + oy) * scale;
        context.bezier((from.x + ox) * scale,(from.y + oy) * scale,cx,cy,cx,cy,(to.x + ox) * scale,(to.y + oy) * scale);
      };
      context.push();
      context.blendMode(SCREEN);
      for (let layer = lags.length - 1; layer >= 0; layer--) {
        const lag = lags[layer];
        const color = colors[layer];
        const trailLength = max(1,settings.spectralMotionTrailLength || 1);
        for (let age = trailLength - 1; age >= 0; age--) {
          const toIndex = lag + age;
          const fromIndex = toIndex + (settings.spectralBendEnabled ? settings.spectralBendSpan : 1);
          if (fromIndex >= this.positionHistory.length || toIndex >= this.positionHistory.length) continue;
          const fromRaw = this.positionHistory[fromIndex]; const toRaw = this.positionHistory[toIndex];
          const from = fromRaw && refractThroughSubstrate(fromRaw,layer);
          const to = toRaw && refractThroughSubstrate(toRaw,layer);
          if (!from || !to || abs(to.x - from.x) > sceneW / 2 || abs(to.y - from.y) > sceneH / 2) continue;
          const fade = pow(settings.spectralMotionTrailDecay || .56,age);
          const bend = this.bendHistory[min(this.bendHistory.length - 1,toIndex)];
          const layerAlpha = dynamicAlpha * settings.spectralTrailAlphaGain * settings.spectralLayerOpacity[layer] * visibilityFactor * composition.alphaGain * fade;
          const layerWeight = min(settings.spectralMaxTrailWeight,max(1,dynamicWeight * settings.spectralWeight)) * settings.spectralLayerScale[layer] * scale * composition.lineScale * lerp(.58,1,fade);
          if (settings.glassEnabled && !settings.spectralBendColorOnly) {
            context.stroke(0,layerAlpha * settings.glassRimAlpha);
            context.strokeWeight(layerWeight * 1.5);
            trace(from,to,bend,layer);
          }
          context.stroke(color[0],color[1],color[2],layerAlpha);
          context.strokeWeight(layerWeight);
          trace(from,to,bend,layer);
          if (settings.glassEnabled && !settings.spectralBendColorOnly) {
            context.stroke(255,layerAlpha * settings.glassCoreAlpha);
            context.strokeWeight(max(.75,layerWeight * .22));
            trace(from,to,bend,layer);
          }
        }
      }
      context.pop();
      return;
    }

    if (renderer) {
      renderer.stroke(220, coreAlpha);
      renderer.strokeWeight(coreWeight * scale * composition.lineScale);
      renderer.line(this.prev.x * scale, this.prev.y * scale, this.pos.x * scale, this.pos.y * scale);

      renderer.stroke(245, edgeAlphaA);
      renderer.strokeWeight(edgeWeight * scale * composition.lineScale);
      renderer.line(
        (this.prev.x + nx * edgeOffsetA) * scale,
        (this.prev.y + ny * edgeOffsetA) * scale,
        (this.pos.x + nx * edgeOffsetA) * scale,
        (this.pos.y + ny * edgeOffsetA) * scale
      );

      renderer.stroke(220, edgeAlphaB);
      renderer.line(
        (this.prev.x - nx * edgeOffsetB) * scale,
        (this.prev.y - ny * edgeOffsetB) * scale,
        (this.pos.x - nx * edgeOffsetB) * scale,
        (this.pos.y - ny * edgeOffsetB) * scale
      );
      return;
    }
    stroke(220, coreAlpha);
    strokeWeight(coreWeight * composition.lineScale);
    line(this.prev.x, this.prev.y, this.pos.x, this.pos.y);

    stroke(0, edgeAlphaA);
    strokeWeight(edgeWeight * composition.lineScale);
    line(
      this.prev.x + nx * edgeOffsetA,
      this.prev.y + ny * edgeOffsetA,
      this.pos.x + nx * edgeOffsetA,
      this.pos.y + ny * edgeOffsetA
    );

    stroke(220, edgeAlphaB);
    line(
      this.prev.x - nx * edgeOffsetB,
      this.prev.y - ny * edgeOffsetB,
      this.pos.x - nx * edgeOffsetB,
      this.pos.y - ny * edgeOffsetB
    );
  }


  show(renderer = null, scale = 1) {
    const settings = window.OVEL_SETTINGS;
    const composition = window.OVEL_VIEWPORT_METRICS ? window.OVEL_VIEWPORT_METRICS() : { coreScale:1,nodeScale:1,alphaGain:1 };
    // Iterations may either share one aperture or expose authored mass through a
    // bounded radius. Dynamic force mass never deforms or pulses the square.
    const baseNodeRadius = settings.nodeRenderRadius || this.r;
    let nodeRadius = baseNodeRadius;
    if (settings.nodeVariableSizing) {
      // Let authored mass remain legible without allowing the force simulation
      // to deform or pulse the square itself.
      const massFloor = Math.sqrt(settings.massMin || 1);
      const massCeiling = Math.sqrt(settings.massMax || 100);
      const massRange = Math.max(0.001, massCeiling - massFloor);
      const massPosition = constrain((Math.sqrt(this.baseMass) - massFloor) / massRange, 0, 1);
      nodeRadius = lerp(
        settings.nodeMassRadiusMin || baseNodeRadius,
        settings.nodeMassRadiusMax || baseNodeRadius,
        massPosition
      );
    }
    if (settings.spectralEnabled && !this.isSun) {
      const colors = settings.spectralColors;
      const lags = settings.spectralFrameOffsets;
      const context = renderer || window;
      context.push(); context.noStroke(); context.blendMode(SCREEN);
      for (let layer = lags.length - 1; layer >= 0; layer--) {
        const lag = lags[layer];
        const rawPoint = this.positionHistory[lag]; if (!rawPoint) continue;
        const point = refractThroughSubstrate(rawPoint,layer);
        const color = colors[layer];
        const layerAlpha = min(255,settings.spectralPointAlpha * settings.spectralLayerOpacity[layer] * this.visibilityAlpha / 255 * composition.alphaGain);
        const layerDiameter = nodeRadius * 2 * settings.spectralLayerScale[layer] * scale * composition.nodeScale;
        if (settings.glassEnabled) {
          drawGlassParticle(context,color,point.x * scale,point.y * scale,layerDiameter,layerAlpha,this.surfaceSpecular,settings.telosIlluminationEnabled ? settings.telosLightColor : null);
        } else {
          context.fill(color[0],color[1],color[2],layerAlpha);
          context.rect(point.x * scale - layerDiameter / 2,point.y * scale - layerDiameter / 2,layerDiameter,layerDiameter);
        }
      }
      context.pop(); return;
    }
    if (renderer) {
      if (this.isSun) {
        const core = settings.centralCoreColor;
        renderer.fill(core[0],core[1],core[2],this.sunAlpha);
        renderer.noStroke();
        renderer.ellipse(this.pos.x * scale,this.pos.y * scale,this.r * 2 * scale * composition.coreScale);
        return;
      } else {
        renderer.fill(255, this.visibilityAlpha);
      }
      const nodeDiameter = nodeRadius * 2 * scale * composition.nodeScale;
      renderer.rect(this.pos.x * scale - nodeDiameter / 2,this.pos.y * scale - nodeDiameter / 2,nodeDiameter,nodeDiameter);
      return;
    }
    if (this.isSun) {
      const core = settings.centralCoreColor;
      fill(core[0],core[1],core[2],this.sunAlpha);
      noStroke(); ellipse(this.pos.x,this.pos.y,this.r * 2 * composition.coreScale);
      return;
    } else {
      fill(255, this.visibilityAlpha);
    }
    const nodeDiameter = nodeRadius * 2 * composition.nodeScale;
    rect(this.pos.x - nodeDiameter / 2,this.pos.y - nodeDiameter / 2,nodeDiameter,nodeDiameter);
  }
}
