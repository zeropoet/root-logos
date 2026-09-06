// Every visual and physical control lives here so an authored state can override it.
window.OVEL_DEFAULTS = Object.freeze({
  bodyCount:215, massMin:1, massMax:100, velocity:1, nodeRenderRadius:2.25, nodeVariableSizing:false, nodeMassRadiusMin:2.6, nodeMassRadiusMax:6.2, nodeShape:'square', centerX:.5, centerY:.5,
  sunMass:1000, background:[0,20], crosshairMass:12, crosshairAttractG:.007,
  crosshairAttractMinSq:1, crosshairAttractMaxSq:1000, crosshairAttractBoost:10000000,
  sunPullG:300000, sunPullMinSq:50, sunPullMaxSq:100,
  pairOrbitG:.012, pairOrbitSwirl:.22, pairOrbitMinSq:140, pairOrbitMaxSq:22000,
  collisionRestitution:.14, collisionFriction:.09, collisionCorrection:.65,
  auraBaseSize:1.35, auraPulseSize:.06, auraPulseRate:.0012, auraMaxAlpha:28,
  sunScale:.1, sunAttractMinSq:100000, sunAttractMaxSq:1000000, sunAttractG:.007,
  sunInfluenceRadius:1000, sunMaxRadius:100, sunMinRadius:100, sunFadeMs:10000,
  centralCoreColor:[255,255,255],
  eventHorizonLensingEnabled:false, eventHorizonRadius:2.8,
  eventHorizonBend:.72, eventHorizonCompression:.14,
  eventHorizonDispersion:[-.035,0,.035],
  sunScaleLerp:.001, sunAlphaLerp:.008, trailNoiseTimeScale:.014,
  trailNoiseSpatialScale:.009, trailWeightMin:18, trailWeightMax:220,
  trailAlphaMin:.8, trailAlphaMax:14, trailEdgeNoiseTimeMult:1.8,
  trailEdgeOffsetMin:.35, trailEdgeOffsetMax:1.1, trailCoreWeightFactor:.74,
  trailEdgeWeightFactor:.3, edgeFadeDistance:520, alphaLerp:.12,
  spectralEnabled:false, spectralAlpha:46, spectralPointAlpha:124,
  spectralWeight:.58, spectralColors:[[255,42,22],[30,190,82],[35,92,255]],
  spectralLayerOpacity:[1,.58,.3], spectralLayerScale:[1,.82,.66],
  spectralFrameOffsets:[0,4,8], spectralTrailAlphaGain:4.2, spectralMaxTrailWeight:24,
  spectralMotionTrailLength:1, spectralMotionTrailDecay:.56,
  glassEnabled:false, glassRimAlpha:.58, glassCoreAlpha:.42,
  telosIlluminationEnabled:false, telosLightColor:[255,34,10],
  edgeDeformEnabled:false, edgeDeformAmount:.13,
  edgeDeformVelocity:.012, edgeDeformRate:.028, edgeDeformSegments:18,
  structuralMemoryEnabled:false, structureFieldCount:8,
  structureMemoryFollow:.008, structureMemoryPull:.0016,
  structureSpring:.0012, structureDamping:.022,
  structureViscosity:.018, structureMaxForce:.16,
  scarMemoryEnabled:false, scarPressureGain:.006,
  scarHealing:.0007, scarGravity:.0045, scarStiffness:2.4,
  spectralBendEnabled:false, spectralBendResponse:.18,
  spectralBendResistance:22, spectralBendLimit:24, spectralBendSpan:1,
  spectralBendMaxLength:160, spectralBendSeparation:4.5,
  spectralBendColorOnly:false,
  temporalBondEnabled:false, temporalBondDistance:120,
  temporalBondFormation:.008, temporalBondDecay:.0025,
  temporalBondThreshold:.55, temporalBondMax:18,
  substrateRefractionEnabled:false, substrateRefractionStrength:34,
  substrateRefractionRadius:.24, substrateDispersion:[-.18,0,.18],
  portalMembraneEnabled:false, portalMembraneRadius:.155,
  portalMembraneThickness:.42, portalMembraneTension:.0018,
  portalMembraneViscosity:.055, portalMembraneMaxForce:.12,
  portalTextureStrength:0, portalTextureFrequency:2.6,
  portalTextureRate:.012,
  soundFieldEnabled:false, soundMonochromeEnabled:false,
  soundMasterGain:.2, soundResonance:9,
  soundDelay:.24, soundFeedback:.32,
});

window.OVEL_SETTINGS = { ...window.OVEL_DEFAULTS };

window.OVEL_VIEWPORT_METRICS = () => {
  const shortSide = Math.min(window.innerWidth || 760,window.innerHeight || 760);
  if (shortSide >= 760) return { compact:false,coreScale:1,nodeScale:1,lineScale:1,alphaGain:1,edgeFade:window.OVEL_SETTINGS.edgeFadeDistance };
  const t = Math.max(0,Math.min(1,(shortSide - 320) / 440));
  return {
    compact:true,
    coreScale:.58 + t * .42,
    nodeScale:.9 + t * .1,
    lineScale:.72 + t * .28,
    alphaGain:1.42 - t * .42,
    edgeFade:Math.max(68,shortSide * .22),
  };
};
