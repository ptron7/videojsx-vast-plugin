import VPAIDHTML5Client from 'vpaid-html5-client';
import window from 'global/window';
import document from 'global/document';

/**
 *
 * @param player
 * @param {VASTTracker} tracker
 * @param {Object} options
 */
export default function handleVPAID(player, tracker, options) {
  const creative = tracker.creative;
  const validTypes = ['application/x-javascript', 'text/javascript', 'application/javascript'];
  const validMime = mediaFile => validTypes.indexOf(mediaFile.mimeType.trim()) > -1;

  const vpaidMediaFile = creative.mediaFiles.find(mediaFile => mediaFile.apiFramework === 'VPAID' && validMime(mediaFile));

  if (!vpaidMediaFile) {
    this.player.warn('Only JavaScript VPAID is supported by this player');
    this.player.trigger('adscanceled');
    return;
  }

  const techScreen = player.el().querySelector('.vjs-tech');

  const vpaidContainerElement = document.createElement('div');

  vpaidContainerElement.className = options.vpaid.containerClass;
  vpaidContainerElement.id = options.vpaid.containerId;

  player.el().insertBefore(vpaidContainerElement, player.controlBar.el());

  const vpaidClient = new VPAIDHTML5Client(vpaidContainerElement, techScreen, {});

  player.ads.startLinearAdMode();

  player.pause();
  player.controlBar.hide();

  vpaidClient.loadAdUnit(vpaidMediaFile.fileURL, onLoad);

  function onLoad(err, adUnit) {
    if (err) {
      player.error(err);
      player.controlBar.show();
      player.trigger('aderror');
      return;
    }

    adUnit.handshakeVersion('2.0', onHandShake);
    adUnit.subscribe('AdLoaded', onAdLoaded);
    adUnit.subscribe('AdStarted', onAdStarted);
    adUnit.subscribe('AdStopped', onAdStopped);
    adUnit.subscribe('AdError', onAdError);

    // TODO: handle VAST tracking

    let videoElement;

    function onHandShake(/*error, version*/) {
      const initialDimensions = getPlayerDimensions(player);

      const creativeData = {
        AdParameters: creative.adParameters || ''
      };

      const videoInstance = options.vpaid.videoInstance;

      if (videoInstance === 'same') {
        videoElement = player.tech({kindaKnowWhatImDoing: true}).el();
      } else if (videoInstance === 'new') {
        videoElement = document.createElement('video');
        videoElement.style.cssText = 'position:absolute; top:0; left:0; z-index:2 !important;';
        vpaidContainerElement.appendChild(videoElement);
      } else {
        if (videoInstance !== 'none') {
          player.warn(videoInstance + ' is an invalid videoInstance value. Defaulting to \'none\'.');
        }
        videoElement = null;
      }

      const environmentVars = {
        slot: vpaidContainerElement,
        videoSlot: videoElement
      };

      adUnit.initAd(initialDimensions.width, initialDimensions.height, 'normal', -1, creativeData, environmentVars);
    }

    function onAdLoaded() {
      adUnit.startAd();
    }

    function onAdStarted() {
      player.trigger('ads-ad-started');
      player.on('resize', resizeAd);
      window.addEventListener('resize', resizeAd);
      tracker.trackImpression();
    }

    function onAdStopped() {
      vpaidClient.destroy();
      player.controlBar.show();
      player.off('resize', resizeAd);
      window.removeEventListener('resize', resizeAd);
      player.trigger('adended');
      player.ads.endLinearAdMode();

      if (options.vpaid.videoInstance === 'new' && videoElement.parentElement) {
        videoElement.parentElement.removeChild(videoElement);
      }
    }

    function onAdError(message) {
      // TODO: review
      console.log(`VPAID Error ${message}`);
      try {
        adUnit.stopAd();
      } catch (ignore) {
      }
    }

    function resizeAd() {
      const newDimensions = getPlayerDimensions(player);

      adUnit.resizeAd(newDimensions.width, newDimensions.height, player.isFullscreen() ? 'fullscreen' : 'normal');
    }
  }
}

function getPlayerDimensions(player) {
  let width = player.width();
  let height = player.height();

  if (player.isFullscreen()) {
    width = window.innerWidth;
    height = window.innerHeight;
  }

  return {width, height};
}
