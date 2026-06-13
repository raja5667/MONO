const $ = id => document.getElementById(id);
        const urlInput = $('url-input'), urlBadge = $('url-badge'), urlClear = $('url-clear');
        const btnDownload = $('btn-download'), btnCancel = $('btn-cancel');
        const statusMsg = $('status-msg'), skippedMsg = $('skipped-msg');
        const progFill = $('prog-fill'), progPct = $('prog-pct');
        const progressCard = $('progress-card'), inputCard = $('input-card');
        const videoPreview = $('video-preview'), vidTitle = $('vid-title'), vidChannel = $('vid-channel');
        const thumbImg = $('thumb-img'), thumbDur = $('thumb-dur');
        const waveform = $('waveform'), trackCounter = $('track-counter');

        // ── Waveform ──
        function setWave(active) {
            waveform.querySelectorAll('.wave-bar').forEach(b => {
                active ? b.classList.remove('paused') : b.classList.add('paused');
            });
        }

        // ── Toast ──
        let toastTmr;
        function toast(msg, type = 'ok') {
            const el = $('toast');
            el.textContent = msg; el.className = 'show ' + type;
            clearTimeout(toastTmr);
            toastTmr = setTimeout(() => el.className = '', 3200);
        }

        // ── Check server on load ──
        (async () => {
            try {
                const d = await (await fetch('/api/check')).json();
                if (!d.ffmpeg)   toast('FFmpeg not found — conversions will fail', 'err');
                if (!d.internet) toast('No internet connection detected', 'err');
            } catch {
                toast('Local server not running. Start with: python engine.py', 'err');
            }
        })();

        // ── URL cleanup ──
        function cleanYoutubeUrl(url) {
            try {
                const u = new URL(url.trim());
                const keep = ['v', 'list', 'index', 't', 'start'];
                const cleaned = new URLSearchParams();
                for (const k of keep) { if (u.searchParams.has(k)) cleaned.set(k, u.searchParams.get(k)); }
                u.search = cleaned.toString();
                return u.toString();
            } catch { return url.trim(); }
        }

        // ── URL validation + preview ──
        let validateTimer;
        function onUrlChange() {
            const raw = urlInput.value.trim();
            const url = raw ? cleanYoutubeUrl(raw) : raw;
            if (url !== raw && raw) urlInput.value = url;
            urlClear.style.display = url ? 'block' : 'none';
            inputCard.classList.toggle('focused', !!url);
            if (!url) { urlBadge.style.display = 'none'; hidePreview(); return; }
            clearTimeout(validateTimer);
            validateTimer = setTimeout(() => validateUrl(url), 400);
        }

        async function validateUrl(url) {
            try {
                const d = await (await fetch('/api/validate?url=' + encodeURIComponent(url))).json();
                urlBadge.style.display = 'inline';
                if (!d.valid) {
                    urlBadge.className = 'url-badge invalid'; urlBadge.textContent = 'Invalid URL';
                    hidePreview(); setWave(false);
                } else if (d.playlist) {
                    urlBadge.className = 'url-badge playlist'; urlBadge.textContent = 'Playlist';
                    showPreviewLoading(); fetchMeta(url, true); setWave(true);
                } else {
                    urlBadge.className = 'url-badge valid'; urlBadge.textContent = '✓ Valid';
                    showPreviewLoading(); fetchMeta(url, false); setWave(true);
                }
            } catch { urlBadge.style.display = 'none'; }
        }

        function showPreviewLoading() {
            videoPreview.style.display = 'flex';
            $('sk-title').style.display = 'block'; $('sk-sub').style.display = 'block';
            vidTitle.style.display = 'none'; vidChannel.style.display = 'none';
            thumbImg.src = ''; thumbImg.style.opacity = '0'; thumbDur.textContent = '';
            $('thumb-skeleton').style.display = 'block';
        }

        function hidePreview() { videoPreview.style.display = 'none'; }

        async function fetchMeta(url, isPlaylist) {
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 25000);
                let r;
                try { r = await fetch('/api/meta?url=' + encodeURIComponent(url), { signal: controller.signal }); }
                finally { clearTimeout(timer); }
                if (!r.ok) throw new Error('HTTP ' + r.status);
                const d = await r.json();
                if (d.error) throw new Error(d.error);
                $('sk-title').style.display = 'none'; $('sk-sub').style.display = 'none';
                if (d.thumbnail) {
                    const proxyUrl = '/api/thumbnail?url=' + encodeURIComponent(d.thumbnail);
                    let videoId = null;
                    try {
                        const u = new URL(urlInput.value.trim());
                        videoId = u.searchParams.get('v') || u.pathname.replace('/', '').split('?')[0];
                    } catch {}
                    thumbImg.onerror = function () {
                        if (videoId && this.src !== 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg') {
                            this.onerror = null;
                            this.src = 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg';
                            this.style.opacity = '1';
                            $('thumb-skeleton').style.display = 'none';
                        } else { this.style.opacity = '0.15'; }
                    };
                    thumbImg.onload = function () { this.style.opacity = '1'; $('thumb-skeleton').style.display = 'none'; };
                    thumbImg.style.opacity = '0';
                    thumbImg.src = proxyUrl;
                }
                if (d.duration) thumbDur.textContent = fmtDur(d.duration);
                vidTitle.textContent = d.title || (isPlaylist ? 'Playlist' : 'Unknown Title');
                vidTitle.style.display = 'block';
                const parts = [];
                if (d.channel) parts.push(d.channel);
                if (d.view_count) parts.push(fmtViews(d.view_count) + ' views');
                if (d.track_count) parts.push(d.track_count + ' tracks');
                vidChannel.innerHTML = parts.join('<span class="meta-sep"> · </span>');
                vidChannel.style.display = 'flex';
            } catch (err) {
                $('sk-title').style.display = 'none'; $('sk-sub').style.display = 'none';
                vidTitle.textContent = isPlaylist ? 'Playlist' : 'Video ready to download';
                vidTitle.style.display = 'block';
                const msg = (err && err.name === 'AbortError') ? 'Metadata timed out' : (err && err.message || 'Could not load metadata');
                vidChannel.innerHTML = '<span style="color:#4b5563;font-size:11px">' + msg + '</span>';
                vidChannel.style.display = 'flex';
            }
        }

        function fmtDur(s) {
            if (!s) return '';
            const m = Math.floor(s / 60), sec = s % 60;
            return `${m}:${String(sec).padStart(2, '0')}`;
        }

        function fmtViews(n) {
            if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
            if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
            if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
            return n;
        }

        urlInput.addEventListener('input', onUrlChange);
        urlClear.addEventListener('click', () => {
            urlInput.value = '';
            urlBadge.style.display = 'none';
            urlClear.style.display = 'none';
            hidePreview(); setWave(false);
            inputCard.classList.remove('focused');
        });

        // ── Download ──
        btnDownload.addEventListener('click', async () => {
            const url = cleanYoutubeUrl(urlInput.value.trim());
            if (!url) { toast('Please enter a YouTube URL', 'err'); return; }
            try {
                const d = await (await fetch('/api/download', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                })).json();
                if (d.error) { toast(d.error, 'err'); return; }
                btnDownload.disabled = true; btnCancel.disabled = false;
                progressCard.style.display = 'block';
                _displayedPct = 0; progFill.style.width = '0%'; progPct.textContent = '0%';
                skippedMsg.style.display = 'none'; statusMsg.className = '';
                setWave(true);
                pollDownload();
            } catch { toast('Server not reachable. Is engine.py running?', 'err'); }
        });

        btnCancel.addEventListener('click', async () => {
            await fetch('/api/download/cancel', { method: 'POST' });
            btnCancel.disabled = true;
        });

        let dlPoll;
        let _displayedPct = 0;
        let _animFrame = null;

        function animatePct(target) {
            if (_animFrame) cancelAnimationFrame(_animFrame);
            function step() {
                const diff = target - _displayedPct;
                if (Math.abs(diff) < 0.2) { _displayedPct = target; }
                else { _displayedPct += diff * 0.08; }
                progFill.style.width = _displayedPct.toFixed(1) + '%';
                progPct.textContent = Math.round(_displayedPct) + '%';
                if (_displayedPct < target - 0.2) _animFrame = requestAnimationFrame(step);
                else _animFrame = null;
            }
            _animFrame = requestAnimationFrame(step);
        }

        async function pollDownload() {
            clearTimeout(dlPoll);
            try {
                const d = await (await fetch('/api/download/status')).json();
                statusMsg.textContent = d.status;
                const target = Math.max(_displayedPct, d.progress);
                animatePct(target);
                if (d.total_tracks > 1) trackCounter.textContent = `Track ${d.current_index} of ${d.total_tracks}`;
                else trackCounter.textContent = '';
                if (d.skipped > 0) { skippedMsg.textContent = '⚠ ' + d.skipped + ' skipped'; skippedMsg.style.display = 'inline'; }
                if (d.finished || !d.active) {
                    btnDownload.disabled = false; btnCancel.disabled = true;
                    if (d.error) {
                        statusMsg.className = 'error'; toast('Error: ' + d.error, 'err'); setWave(false);
                    } else {
                        statusMsg.className = 'done';
                        animatePct(100);
                        toast('✓ ' + d.status, 'ok');
                        setTimeout(() => {
                            progressCard.style.display = 'none';
                            _displayedPct = 0; progFill.style.width = '0%';
                            statusMsg.textContent = 'Processing…'; statusMsg.className = '';
                            skippedMsg.style.display = 'none'; trackCounter.textContent = '';
                            setWave(false);
                        }, 4000);
                    }
                    return;
                }
                dlPoll = setTimeout(pollDownload, 300);
            } catch { dlPoll = setTimeout(pollDownload, 1200); }
        }

        // ── Paste anywhere ──
        document.addEventListener('paste', e => {
            if (document.activeElement !== urlInput) {
                const text = (e.clipboardData || window.clipboardData).getData('text');
                if (text && (text.includes('youtube.com') || text.includes('youtu.be'))) {
                    urlInput.value = text.trim(); onUrlChange();
                }
            }
        });

        // ── Enter key ──
        document.addEventListener('keydown', e => {
            if (e.key === 'Enter' && document.activeElement === urlInput) btnDownload.click();
        });