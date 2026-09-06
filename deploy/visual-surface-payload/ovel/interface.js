(() => {
  const seed = 3165167791;
  const relationWitness = window.OVEL_TELOS_RELATIONS;
  if (!relationWitness?.relationCount) throw new Error('ØVEL requires a witnessed Telos relation field.');
  const profile = {
    bodyCount:relationWitness.relationCount, velocity:1.22, nodeRenderRadius:3.1, nodeVariableSizing:true, nodeMassRadiusMin:2.8, nodeMassRadiusMax:6.2, nodeShape:'square',
    nodeCountAuthority:'telos-living-system/v1', nodeCountBasis:'all published relations',
    spectralEnabled:true, glassEnabled:true, background:[0,40], spectralPointAlpha:226, spectralWeight:.44,
    spectralColors:[[255,30,18],[18,205,92],[34,92,255],[255,72,30],[42,232,126],[72,126,255]],
    spectralLayerOpacity:[1,.8,.64,.49,.35,.23], spectralLayerScale:[1,.95,.9,.85,.8,.75],
    spectralFrameOffsets:[0,2,4,6,8,10], spectralTrailAlphaGain:1.5, spectralMaxTrailWeight:16,
    spectralMotionTrailLength:4, spectralMotionTrailDecay:.52,
    glassRimAlpha:.42, glassCoreAlpha:.34, telosIlluminationEnabled:true, telosLightColor:[255,34,10],
    structuralMemoryEnabled:true, structureFieldCount:11, structureMemoryFollow:.007,
    structureMemoryPull:.0016, structureSpring:.0012, structureDamping:.022,
    structureViscosity:.018, structureMaxForce:.16,
    scarMemoryEnabled:true, scarPressureGain:.006, scarHealing:.0007, scarGravity:.0045, scarStiffness:2.4,
    spectralBendEnabled:true, spectralBendResponse:.18, spectralBendResistance:22,
    spectralBendLimit:24, spectralBendSpan:1, spectralBendMaxLength:160,
    spectralBendSeparation:4.5, spectralBendColorOnly:true,
    temporalBondEnabled:true, temporalBondDistance:120, temporalBondFormation:.008,
    temporalBondDecay:.0025, temporalBondThreshold:.55, temporalBondMax:26,
    substrateRefractionEnabled:true, substrateRefractionStrength:42, substrateRefractionRadius:.29,
    substrateDispersion:[-.22,-.13,-.04,.04,.13,.22], centralCoreColor:[0,0,0], auraMaxAlpha:0,
    portalMembraneEnabled:true, portalMembraneRadius:.16, portalMembraneThickness:.46,
    portalMembraneTension:.0022, portalMembraneViscosity:.055, portalMembraneMaxForce:.14,
    portalTextureStrength:16, portalTextureFrequency:2.8, portalTextureRate:.012,
    eventHorizonLensingEnabled:true, eventHorizonRadius:3.35, eventHorizonBend:0,
    eventHorizonCompression:.22, eventHorizonDispersion:[0,0,0,0,0,0],
    edgeDeformEnabled:false, edgeDeformAmount:0, edgeDeformVelocity:0,
    edgeDeformRate:.02, edgeDeformSegments:28,
    soundFieldEnabled:true, soundMonochromeEnabled:false, soundMasterGain:.2,
    soundResonance:9, soundDelay:.24, soundFeedback:.32,
  };
  window.OVEL_CURRENT_SEED = seed;
  window.OVEL_CURRENT_PROFILE = profile;
  window.OVEL_SETTINGS = { ...window.OVEL_DEFAULTS,...profile };
  const soundButton = document.querySelector('#soundButton');
  soundButton.addEventListener('click',async () => {
    const active = await window.OVEL_SOUND.toggle();
    soundButton.querySelector('b').textContent = active ? 'Silence' : 'Listen';
    soundButton.setAttribute('aria-pressed',String(active));
  });
})();
