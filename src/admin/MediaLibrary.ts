// The media library panel: import an image, then pick one.
//
// It exists so an author stops typing image paths. ADR 0001 section 13.16 left
// the image properties panel with a free-text path, which meant a typo was only
// discovered by the publish gate, long after the writing. Everything listed
// here is already sanitized and already recorded, so choosing from the list is
// the only way to produce a reference the gate will accept.
//
// The thumbnails come from /api/media/<id>/file, not from `publicPath`. An
// imported file only reaches the public tree at the next export (ADR 0002
// section 15.3), so the path an author is inserting genuinely does not resolve
// yet. Showing the file through the author API is honest about that; showing a
// broken image and calling it a preview would not be.

import { computed, defineComponent, onMounted, ref } from 'vue';
import { api, messageForApiFailure, type MediaAsset } from './api.ts';

export default defineComponent({
  name: 'MediaLibrary',
  props: {
    group: { type: String, default: '' },
    /** True while an image node is selected, so picking replaces rather than adds. */
    replacing: { type: Boolean, default: false },
  },
  emits: ['insert', 'cover'],
  setup(props, { emit }) {
    const assets = ref<MediaAsset[]>([]);
    const failure = ref('');
    const status = ref('');
    const busy = ref(false);
    const loaded = ref(false);
    const file = ref<File | null>(null);
    const alt = ref('');
    const caption = ref('');
    const copyright = ref('');
    const fileName = computed(() => file.value?.name ?? '');
    const ready = computed(() => file.value !== null && alt.value.trim().length > 0);

    function report(error: unknown): void {
      failure.value = messageForApiFailure(
        error,
        '连接不上后台，这次没有导入。请检查网络后重试。',
      );
    }

    async function refresh(): Promise<void> {
      failure.value = '';
      try {
        assets.value = (await api.listMedia()).assets;
        loaded.value = true;
      } catch (error) {
        report(error);
      }
    }

    function chooseFile(event: Event): void {
      const input = event.target as HTMLInputElement;
      file.value = input.files?.[0] ?? null;
      status.value = '';
    }

    async function upload(): Promise<void> {
      if (!file.value || busy.value) return;
      busy.value = true;
      failure.value = '';
      status.value = '';
      try {
        const result = await api.importMedia({
          file: file.value,
          alt: alt.value,
          group: props.group || undefined,
          caption: caption.value.trim() || undefined,
          copyright: copyright.value.trim() || undefined,
        });
        file.value = null;
        alt.value = '';
        caption.value = '';
        copyright.value = '';
        status.value = `已导入 ${result.asset.publicPath}，元数据已剥离并复核。`;
        await refresh();
      } catch (error) {
        report(error);
      } finally {
        busy.value = false;
      }
    }

    function fileUrl(asset: MediaAsset): string {
      return api.mediaFileUrl(asset);
    }

    onMounted(() => void refresh());

    return {
      assets,
      failure,
      status,
      busy,
      loaded,
      alt,
      caption,
      copyright,
      fileName,
      ready,
      chooseFile,
      upload,
      refresh,
      fileUrl,
      insert: (asset: MediaAsset) => emit('insert', asset),
      setCover: (asset: MediaAsset) => emit('cover', asset),
    };
  },
  template: `
    <section class="subpanel media-library">
      <h2>媒体库</h2>
      <p class="note">导入时服务端会重新编码并剥离 EXIF/XMP/IPTC，再读回文件复核。原图不上传，也不会被改写。</p>

      <form class="media-upload" @submit.prevent="upload">
        <label>
          <span>选择图片（JPEG / PNG / WebP / AVIF / TIFF）</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/tiff" @change="chooseFile" />
        </label>
        <p v-if="fileName" class="note">待导入：{{ fileName }}</p>
        <label><span>替代文字（必填）</span><textarea v-model="alt" rows="2"></textarea></label>
        <label><span>说明文字（可选）</span><input v-model="caption" /></label>
        <label><span>版权（可选）</span><input v-model="copyright" /></label>
        <button class="primary" type="submit" :disabled="busy || !ready">{{ busy ? '导入中…' : '导入并净化' }}</button>
        <p v-if="!ready && fileName" class="field-error">替代文字为空时不能导入。</p>
      </form>

      <p v-if="failure" class="message error" role="alert">{{ failure }}</p>
      <p v-else-if="status" class="message" role="status" aria-live="polite">{{ status }}</p>

      <p v-if="loaded && assets.length === 0" class="empty">媒体库还是空的。</p>
      <ul v-else class="media-list">
        <li v-for="asset in assets" :key="asset.id">
          <img :src="fileUrl(asset)" :alt="asset.alt" loading="lazy" />
          <div class="media-facts">
            <code>{{ asset.publicPath }}</code>
            <small>{{ asset.format }} · {{ asset.width }}×{{ asset.height }}</small>
            <small>{{ asset.alt }}</small>
          </div>
          <div class="row-actions">
            <button type="button" @click="insert(asset)">{{ replacing ? '替换选中图片' : '插入正文' }}</button>
            <button type="button" @click="setCover(asset)">设为封面</button>
          </div>
        </li>
      </ul>
      <p class="note">这里的路径要等下一次导出才会出现在静态站上；缩略图走作者接口，读者看不到。</p>
    </section>
  `,
});
