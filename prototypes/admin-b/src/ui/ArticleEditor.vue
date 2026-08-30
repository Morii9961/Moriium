<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import { moriiumExtensions } from '../editor/extensions.ts';
import {
  selectedImageAttributes,
  updateSelectedImage,
  type MoriiumImageAttributes,
} from '../editor/image-properties.ts';
import { api, ApiError, type ArticleDetail, type Version } from './api.ts';

const props = defineProps<{ articleId: number }>();
const emit = defineEmits<{ (event: 'back'): void }>();

const detail = shallowRef<ArticleDetail | null>(null);
const title = ref('');
const summary = ref('');
const status = ref('');
const failure = ref('');
const busy = ref(false);
const readerMarkdown = ref<string | null>(null);
const readerLoaded = ref(false);
const selectedImage = ref<MoriiumImageAttributes | null>(null);
const previewHtml = ref('');
const previewing = ref(false);

const editor = useEditor({ extensions: moriiumExtensions(), content: '' });

let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
let dirty = false;

const article = computed(() => detail.value?.article ?? null);
const isDraft = computed(() => article.value?.publishedVersionId == null);
const latest = computed(() => detail.value?.latest ?? null);
const publishedId = computed(() => article.value?.publishedVersionId ?? null);

function report(error: unknown): void {
  if (error instanceof ApiError) {
    failure.value = error.message;
    return;
  }
  // fetch rejects when the API is unreachable, and String() on that gives the
  // author "TypeError: Failed to fetch". The B10 drill (ADR 13.20) saw exactly
  // that. What actually matters to them is that the text is still here, that it
  // is not saved, and that nothing will retry until they type again.
  failure.value = `连接不上后台，这次没有保存。改动还在编辑器里，再改一个字会重新触发保存。（${String(error)}）`;
}

function syncSelectedImage(): void {
  const instance = editor.value;
  selectedImage.value = instance ? selectedImageAttributes(instance) : null;
}

function applySelectedImage(): void {
  const instance = editor.value;
  const attributes = selectedImage.value;
  if (!instance || !attributes) return;
  updateSelectedImage(instance, attributes);
}

async function load(): Promise<void> {
  failure.value = '';
  try {
    const loaded = await api.getArticle(props.articleId);
    detail.value = loaded;
    title.value = loaded.latest?.title ?? '';
    summary.value = loaded.latest?.summary ?? '';
    editor.value?.commands.setContent(loaded.latest?.markdown ?? '', { contentType: 'markdown' });
    syncSelectedImage();
    previewHtml.value = '';
    dirty = false;
    status.value = '';
    await refreshReaderView();
  } catch (error) {
    report(error);
  }
}

async function refreshReaderView(): Promise<void> {
  readerLoaded.value = false;
  try {
    const view = await api.readerView(props.articleId);
    readerMarkdown.value = view?.version.markdown ?? null;
  } catch (error) {
    report(error);
  } finally {
    readerLoaded.value = true;
  }
}

/** The editor's Markdown, which is the canonical content ADR section 8 settled on. */
function currentMarkdown(): string {
  return editor.value?.getMarkdown() ?? '';
}

function payload(): { title: string; summary: string; markdown: string; editorJson: string } {
  return {
    title: title.value,
    summary: summary.value,
    markdown: currentMarkdown(),
    editorJson: JSON.stringify(editor.value?.getJSON() ?? {}),
  };
}

/**
 * Renders what is in the editor right now through the production pipeline.
 *
 * Deliberately manual. The processor is not free to run, and a preview that
 * silently followed every keystroke would invite reading it as the live page.
 */
async function refreshPreview(): Promise<void> {
  previewing.value = true;
  failure.value = '';
  try {
    const rendered = await api.preview(props.articleId, currentMarkdown());
    previewHtml.value = rendered.html;
  } catch (error) {
    report(error);
  } finally {
    previewing.value = false;
  }
}

async function autosave(): Promise<void> {
  if (!dirty || busy.value) return;
  try {
    await api.autosave(props.articleId, payload());
    dirty = false;
    status.value = `自动保存于 ${new Date().toLocaleTimeString()}（读者看到的内容不变）`;
    detail.value = await api.getArticle(props.articleId);
  } catch (error) {
    report(error);
  }
}

function scheduleAutosave(): void {
  dirty = true;
  status.value = '未保存的改动…';
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => void autosave(), 1500);
}

async function saveVersion(): Promise<void> {
  busy.value = true;
  failure.value = '';
  try {
    await api.saveVersion(props.articleId, payload());
    dirty = false;
    detail.value = await api.getArticle(props.articleId);
    status.value = '已保存一个手动版本。';
  } catch (error) {
    report(error);
  } finally {
    busy.value = false;
  }
}

async function publishLatest(): Promise<void> {
  const version = latest.value;
  if (!version) return;
  busy.value = true;
  failure.value = '';
  try {
    await api.publish(props.articleId, version.id, '从原型 B 的编辑器发布');
    detail.value = await api.getArticle(props.articleId);
    await refreshReaderView();
    status.value = `已发布版本 #${version.id}。`;
  } catch (error) {
    report(error);
  } finally {
    busy.value = false;
  }
}

async function rollbackTo(version: Version): Promise<void> {
  busy.value = true;
  failure.value = '';
  try {
    await api.rollback(props.articleId, version.id, '从版本历史回滚');
    detail.value = await api.getArticle(props.articleId);
    await refreshReaderView();
    status.value = `已回滚到版本 #${version.id}。`;
  } catch (error) {
    report(error);
  } finally {
    busy.value = false;
  }
}

function openVersion(version: Version): void {
  title.value = version.title;
  summary.value = version.summary;
  editor.value?.commands.setContent(version.markdown, { contentType: 'markdown' });
  syncSelectedImage();
  previewHtml.value = '';
  dirty = false;
  status.value = `已把版本 #${version.id} 载入编辑器，尚未保存。`;
}

watch(editor, (instance) => {
  instance?.on('update', scheduleAutosave);
  // selectionUpdate is the documented event for reflecting the current node
  // in external controls. https://tiptap.dev/docs/editor/api/events
  instance?.on('selectionUpdate', syncSelectedImage);
  syncSelectedImage();
});
watch(() => props.articleId, () => void load(), { immediate: true });

onBeforeUnmount(() => {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  editor.value?.off('update', scheduleAutosave);
  editor.value?.off('selectionUpdate', syncSelectedImage);
  editor.value?.destroy();
});
</script>

<template>
  <div class="wrap">
    <p>
      <button @click="emit('back')">← 返回列表</button>
    </p>

    <p v-if="failure" class="error">{{ failure }}</p>

    <template v-if="article">
      <h2 style="margin-top: 0">
        {{ article.slug }}
        <span class="tag" :class="isDraft ? 'draft' : 'live'">{{ isDraft ? '草稿' : '已发布' }}</span>
      </h2>

      <div class="cols">
        <div>
          <div class="field">
            <label for="title">标题</label>
            <input id="title" v-model="title" type="text" @input="scheduleAutosave" />
          </div>
          <div class="field">
            <label for="summary">摘要</label>
            <textarea id="summary" v-model="summary" rows="2" @input="scheduleAutosave"></textarea>
          </div>

          <div class="field">
            <label>正文</label>
            <div class="editor">
              <EditorContent :editor="editor" />
            </div>
          </div>

          <div v-if="selectedImage" class="panel image-properties">
            <h2>图片属性</h2>
            <div class="field">
              <label for="image-src">公开路径</label>
              <input id="image-src" v-model="selectedImage.src" type="text" @input="applySelectedImage" />
            </div>
            <div class="field">
              <label for="image-alt">替代文字（必填）</label>
              <textarea
                id="image-alt"
                v-model="selectedImage.alt"
                rows="2"
                @input="applySelectedImage"
              ></textarea>
              <p v-if="selectedImage.alt.trim().length === 0" class="error">
                替代文字为空时，发布闸门会拒绝这篇文章。
              </p>
            </div>
            <div class="field">
              <label for="image-title">说明文字（可选）</label>
              <input id="image-title" v-model="selectedImage.title" type="text" @input="applySelectedImage" />
            </div>
            <p class="note">路径必须存在于媒体清单；留空说明文字会从 Markdown 中移除标题。</p>
          </div>
          <p v-else class="note image-properties-hint">选中正文中的图片后，可在这里修改路径、替代文字和说明。</p>

          <p class="note">{{ status }}</p>

          <p>
            <button :disabled="busy" @click="saveVersion">保存版本</button>
            <button
              class="primary"
              style="margin-left: 8px"
              :disabled="busy || !latest || latest.id === publishedId"
              @click="publishLatest"
            >
              发布最新版本
            </button>
          </p>
        </div>

        <div>
          <div class="panel" style="margin-bottom: 16px">
            <h2>版本历史</h2>
            <ul class="versions">
              <li v-for="version in detail?.versions ?? []" :key="version.id">
                <span class="grow">
                  #{{ version.id }}
                  <span class="tag">{{ version.kind === 'autosave' ? '自动' : '手动' }}</span>
                  <span v-if="version.id === publishedId" class="tag live">公开</span>
                </span>
                <button @click="openVersion(version)">载入</button>
                <button :disabled="busy || version.id === publishedId" @click="rollbackTo(version)">
                  回滚
                </button>
              </li>
            </ul>
          </div>

          <div class="panel" style="margin-bottom: 16px">
            <h2>生产渲染预览</h2>
            <p>
              <button :disabled="previewing" @click="refreshPreview">
                {{ previewing ? '渲染中…' : '按生产管线渲染' }}
              </button>
            </p>
            <!--
              allow-same-origin is what makes `/media/fixtures/...` resolve, and
              it is only safe because allow-scripts is absent: a srcdoc frame
              with no script can do nothing with the origin it is given. Adding
              allow-scripts later would hand the previewed content the parent's
              origin, so do not add it without another way to serve the media.
            -->
            <iframe
              v-if="previewHtml"
              class="preview"
              sandbox="allow-same-origin"
              title="草稿的生产渲染预览"
              :srcdoc="previewHtml"
            ></iframe>
            <p class="note">
              渲染走的是 <code>astro.config.mjs</code> 里生产自己的 remark/rehype 管线，与
              <code>fixtures/baseline/</code> 逐字节一致。<strong>不含站点样式表</strong>，所以结构同源，外观不同源。
            </p>
          </div>

          <div class="panel">
            <h2>读者看到的</h2>
            <p v-if="!readerLoaded" class="note">读取中…</p>
            <p v-else-if="readerMarkdown === null" class="note">
              尚未发布，匿名读者会得到 404。自动保存不会改变这里。
            </p>
            <pre v-else class="reader">{{ readerMarkdown }}</pre>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
