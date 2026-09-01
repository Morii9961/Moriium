import { computed, defineComponent, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import MediaLibrary from './MediaLibrary.ts';
import {
  api,
  messageForApiFailure,
  type ArticleDetail,
  type MediaAsset,
  type Version,
  type VersionFields,
} from './api.ts';
import { moriiumExtensions } from './editor/extensions.ts';
import {
  selectedImageAttributes,
  updateSelectedImage,
  type MoriiumImageAttributes,
} from './editor/image-properties.ts';

/**
 * Narrows a stored version to the fields a save is allowed to send.
 *
 * `Version` is `VersionFields` plus `id`, `articleId`, `authorId`, `kind` and
 * `createdAt`. Spreading the whole object into the form left those five on the
 * payload, and the API schema is `.strict()`, so every save and autosave after
 * the editor had loaded a version -- which is every editor open -- came back
 * 400 "The article request is invalid." TypeScript could not catch it: excess
 * property checks apply to object literals, not to a spread of a wider type.
 * Listing the fields is what makes the payload's shape checkable at all
 * (ADR 0002 section 21.27).
 */
function toFields(version: Version): VersionFields {
  return {
    title: version.title,
    summary: version.summary,
    publishedAt: version.publishedAt,
    updatedAt: version.updatedAt,
    category: version.category,
    tags: [...version.tags],
    cover: version.cover,
    coverAlt: version.coverAlt,
    draft: version.draft,
    unlisted: version.unlisted,
    copyProtection: version.copyProtection,
    markdown: version.markdown,
    editorJson: version.editorJson,
  };
}

function blankFields(): VersionFields {
  return {
    title: '',
    summary: '',
    publishedAt: '',
    updatedAt: null,
    category: '',
    tags: [],
    cover: null,
    coverAlt: null,
    draft: false,
    unlisted: false,
    copyProtection: false,
    markdown: '',
    editorJson: null,
  };
}

export default defineComponent({
  name: 'ArticleEditor',
  components: { EditorContent, MediaLibrary },
  props: { articleId: { type: Number, required: true } },
  emits: ['back'],
  setup(props, { emit }) {
    const detail = shallowRef<ArticleDetail | null>(null);
    const fields = ref<VersionFields>(blankFields());
    const tagsText = ref('');
    const status = ref('');
    const failure = ref('');
    const busy = ref(false);
    const saving = ref(false);
    const dirty = ref(false);
    const previewHtml = ref('');
    const previewing = ref(false);
    const selectedImage = ref<MoriiumImageAttributes | null>(null);
    const editor = useEditor({ extensions: moriiumExtensions(), content: '' });
    let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingMarkdown: string | null = null;
    let revision = 0;
    const onEditorUpdate = (): void => scheduleAutosave();

    const article = computed(() => detail.value?.article ?? null);
    const latest = computed(() => detail.value?.latest ?? null);
    const published = computed(() => detail.value?.published ?? null);
    const live = computed(() => detail.value?.live ?? null);

    function report(error: unknown): void {
      failure.value = messageForApiFailure(
        error,
        '连接不上后台，这次没有保存。改动仍在编辑器里。',
      );
    }

    function syncImageSelection(): void {
      selectedImage.value = editor.value ? selectedImageAttributes(editor.value) : null;
    }

    function applySelectedImage(): void {
      if (!editor.value || !selectedImage.value) return;
      updateSelectedImage(editor.value, selectedImage.value);
      scheduleAutosave();
    }

    /**
     * Inserts a library image at the cursor.
     *
     * `trailing` carries the newline the Markdown serializer writes after the
     * image. Leaving it empty would run the next block onto the same line, and
     * the round-trip tests are what noticed that the attribute is content, not
     * decoration.
     */
    function insertAsset(asset: MediaAsset): void {
      const instance = editor.value;
      if (!instance) return;
      if (selectedImage.value) {
        // An image is selected, so the author is repointing it rather than
        // adding one. Both paths go through the library; neither types a path.
        selectedImage.value = { src: asset.publicPath, alt: asset.alt, title: asset.caption };
        applySelectedImage();
        status.value = `选中的图片已改为 ${asset.publicPath}。`;
        return;
      }
      instance
        .chain()
        .focus()
        .insertContent({
          type: 'moriiumImage',
          attrs: {
            src: asset.publicPath,
            alt: asset.alt,
            title: asset.caption,
            trailing: '\n',
          },
        })
        .run();
      syncImageSelection();
      scheduleAutosave();
      status.value = `已插入 ${asset.publicPath}。`;
    }

    /** Points the cover at a library image, alt text included. */
    function useAsCover(asset: MediaAsset): void {
      fields.value.cover = asset.publicPath;
      fields.value.coverAlt = asset.alt;
      scheduleAutosave();
      status.value = `封面已指向 ${asset.publicPath}。`;
    }

    function currentMarkdown(): string {
      return editor.value?.getMarkdown() ?? pendingMarkdown ?? fields.value.markdown;
    }

    function setEditorMarkdown(markdown: string): void {
      const instance = editor.value;
      if (!instance) {
        pendingMarkdown = markdown;
        return;
      }
      instance.commands.setContent(markdown, {
        contentType: 'markdown',
        emitUpdate: false,
      });
      pendingMarkdown = null;
      syncImageSelection();
    }

    function currentPayload(): VersionFields {
      const tags = [...new Set(tagsText.value.split(/[,\n]/).map((tag) => tag.trim()).filter(Boolean))];
      return {
        ...fields.value,
        tags,
        cover: fields.value.cover?.trim() || null,
        coverAlt: fields.value.coverAlt?.trim() || null,
        updatedAt: fields.value.updatedAt?.trim() || null,
        markdown: currentMarkdown(),
        editorJson: JSON.stringify(editor.value?.getJSON() ?? {}),
      };
    }

    async function refreshDetail(): Promise<void> {
      detail.value = await api.getArticle(props.articleId);
    }

    async function load(): Promise<void> {
      failure.value = '';
      try {
        await refreshDetail();
        const version = detail.value?.latest;
        if (!version) return;
        fields.value = toFields(version);
        tagsText.value = version.tags.join(', ');
        setEditorMarkdown(version.markdown);
        dirty.value = false;
        previewHtml.value = '';
        status.value = '';
      } catch (error) {
        report(error);
      }
    }

    async function persist(kind: 'manual' | 'autosave'): Promise<Version | null> {
      if (saving.value) return null;
      saving.value = true;
      const savingRevision = revision;
      try {
        const result = kind === 'autosave'
          ? await api.autosave(props.articleId, currentPayload())
          : await api.saveVersion(props.articleId, currentPayload());
        await refreshDetail();
        if (revision === savingRevision) dirty.value = false;
        status.value = kind === 'autosave'
          ? `自动保存于 ${new Date().toLocaleTimeString()}；公开内容没有改变。`
          : `已保存手动版本 #${result.version.id}。`;
        return result.version;
      } catch (error) {
        report(error);
        return null;
      } finally {
        saving.value = false;
        if (dirty.value && revision !== savingRevision) scheduleAutosave(false);
      }
    }

    async function autosave(): Promise<void> {
      if (!dirty.value || busy.value) return;
      await persist('autosave');
    }

    function scheduleAutosave(increment = true): void {
      if (increment) revision += 1;
      dirty.value = true;
      status.value = '有尚未保存的改动。';
      if (autosaveTimer) clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(() => void autosave(), 1_500);
    }

    async function saveVersion(): Promise<void> {
      if (autosaveTimer) clearTimeout(autosaveTimer);
      await persist('manual');
    }

    async function closeEditor(): Promise<void> {
      if (busy.value || saving.value) return;
      if (autosaveTimer) clearTimeout(autosaveTimer);
      if (dirty.value) {
        const saved = await persist('autosave');
        if (!saved || dirty.value) return;
      }
      emit('back');
    }

    async function publishCurrent(): Promise<void> {
      busy.value = true;
      failure.value = '';
      try {
        let version = latest.value;
        if (dirty.value) version = await persist('manual');
        if (!version) return;
        await api.publish(props.articleId, version.id, '从生产 Admin 发布');
        await refreshDetail();
        status.value = `数据库已发布版本 #${version.id}；等待静态站导出。`;
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
        await api.rollback(props.articleId, version.id, '从生产 Admin 回滚');
        await refreshDetail();
        status.value = `数据库已回滚到版本 #${version.id}；等待静态站导出。`;
      } catch (error) {
        report(error);
      } finally {
        busy.value = false;
      }
    }

    async function unpublish(): Promise<void> {
      if (!window.confirm('撤下这篇文章？数据库会立即变成未发布，静态站仍需等待下一次导出。')) return;
      busy.value = true;
      failure.value = '';
      try {
        await api.unpublish(props.articleId, '从生产 Admin 撤下');
        await refreshDetail();
        status.value = '数据库已撤下文章；等待静态站导出。';
      } catch (error) {
        report(error);
      } finally {
        busy.value = false;
      }
    }

    function openVersion(version: Version): void {
      if (busy.value || saving.value) return;
      fields.value = toFields(version);
      tagsText.value = version.tags.join(', ');
      setEditorMarkdown(version.markdown);
      previewHtml.value = '';
      if (autosaveTimer) clearTimeout(autosaveTimer);
      revision += 1;
      dirty.value = true;
      status.value = `版本 #${version.id} 已载入编辑器，尚未另存为新版本。`;
    }

    async function refreshPreview(): Promise<void> {
      previewing.value = true;
      failure.value = '';
      try {
        previewHtml.value = (await api.preview(props.articleId, currentMarkdown())).html;
      } catch (error) {
        report(error);
      } finally {
        previewing.value = false;
      }
    }

    watch(editor, (instance) => {
      instance?.on('update', onEditorUpdate);
      instance?.on('selectionUpdate', syncImageSelection);
      if (instance && pendingMarkdown !== null) setEditorMarkdown(pendingMarkdown);
      syncImageSelection();
    });
    watch(() => props.articleId, () => void load(), { immediate: true });

    onBeforeUnmount(() => {
      if (autosaveTimer) clearTimeout(autosaveTimer);
      editor.value?.off('update', onEditorUpdate);
      editor.value?.off('selectionUpdate', syncImageSelection);
      editor.value?.destroy();
    });

    return {
      article,
      detail,
      fields,
      tagsText,
      latest,
      published,
      live,
      status,
      failure,
      busy,
      saving,
      dirty,
      previewHtml,
      previewing,
      selectedImage,
      editor,
      scheduleAutosave,
      applySelectedImage,
      insertAsset,
      useAsCover,
      closeEditor,
      saveVersion,
      publishCurrent,
      rollbackTo,
      unpublish,
      openVersion,
      refreshPreview,
    };
  },
  template: `
    <main class="admin-wrap" v-if="article">
      <div class="editor-heading">
        <button type="button" class="quiet" :disabled="busy || saving" @click="closeEditor">← 返回文章列表</button>
        <div>
          <p class="eyebrow">{{ article.lang }} · {{ article.slug }}</p>
          <h1>{{ fields.title || '未命名文章' }}</h1>
        </div>
      </div>

      <p v-if="failure" class="message error" role="alert">{{ failure }}</p>
      <p class="message" role="status" aria-live="polite">
        <span v-if="saving">正在保存…</span><span v-else>{{ status }}</span>
      </p>

      <div class="state-strip" aria-label="文章版本状态">
        <span>最新 <strong>#{{ latest?.id ?? '—' }}</strong></span>
        <span>已发布 <strong>#{{ published?.id ?? '—' }}</strong></span>
        <span>已上线 <strong>#{{ live?.id ?? '—' }}</strong></span>
        <span v-if="detail?.awaitingExport" class="state waiting">等待导出</span>
        <span v-if="detail?.hasUnpublishedChanges" class="state changed">有未发布改动</span>
      </div>

      <div class="editor-grid">
        <section class="editor-main" aria-label="文章编辑">
          <div class="form-grid two">
            <label><span>标题</span><input v-model="fields.title" @input="scheduleAutosave" /></label>
            <label><span>分类</span><input v-model="fields.category" @input="scheduleAutosave" /></label>
          </div>
          <label><span>摘要</span><textarea v-model="fields.summary" rows="3" maxlength="280" @input="scheduleAutosave"></textarea></label>
          <div class="form-grid two">
            <label><span>发布日期（ISO 8601）</span><input v-model="fields.publishedAt" @input="scheduleAutosave" /></label>
            <label><span>更新日期（可空）</span><input :value="fields.updatedAt ?? ''" @input="fields.updatedAt = $event.target.value || null; scheduleAutosave()" /></label>
          </div>
          <label><span>标签（逗号或换行分隔）</span><textarea v-model="tagsText" rows="2" @input="scheduleAutosave"></textarea></label>
          <div class="form-grid two">
            <label><span>封面公开路径（可空）</span><input :value="fields.cover ?? ''" @input="fields.cover = $event.target.value || null; scheduleAutosave()" /></label>
            <label><span>封面替代文字</span><input :value="fields.coverAlt ?? ''" @input="fields.coverAlt = $event.target.value || null; scheduleAutosave()" /></label>
          </div>
          <fieldset class="checks">
            <legend>发布属性</legend>
            <label><input v-model="fields.draft" type="checkbox" @change="scheduleAutosave" /> draft 标记（勾选时发布门禁会拒绝）</label>
            <label><input v-model="fields.unlisted" type="checkbox" @change="scheduleAutosave" /> 不在列表中显示</label>
            <label><input v-model="fields.copyProtection" type="checkbox" @change="scheduleAutosave" /> 启用复制限制</label>
          </fieldset>

          <label><span>正文</span><div class="tiptap-shell"><EditorContent :editor="editor" /></div></label>

          <section v-if="selectedImage" class="subpanel image-properties">
            <h2>图片属性</h2>
            <label><span>公开路径（由媒体库决定）</span><input :value="selectedImage.src" readonly /></label>
            <p class="note">路径不再手填。要换图，在右侧媒体库里选一张，它会替换当前选中的图片。</p>
            <label><span>替代文字（必填）</span><textarea v-model="selectedImage.alt" rows="2" @input="applySelectedImage"></textarea></label>
            <label><span>说明文字（可选）</span><input v-model="selectedImage.title" @input="applySelectedImage" /></label>
            <p v-if="!selectedImage.alt.trim()" class="field-error">替代文字为空时，发布门禁会拒绝。</p>
          </section>

          <div class="editor-actions">
            <button type="button" :disabled="busy || saving" @click="saveVersion">保存版本</button>
            <button type="button" class="primary" :disabled="busy || saving || !latest" @click="publishCurrent">发布当前内容</button>
            <button v-if="published" type="button" class="danger" :disabled="busy || saving" @click="unpublish">撤下文章</button>
          </div>
        </section>

        <aside class="editor-aside">
          <section class="subpanel">
            <h2>文章身份</h2>
            <dl>
              <dt>translationKey</dt><dd>{{ article.translationKey }}</dd>
              <dt>语言</dt><dd>{{ article.lang }}</dd>
              <dt>slug</dt><dd>{{ article.slug }}</dd>
            </dl>
            <p class="note">这三项在新建后保持不变，避免翻译关系和公开 URL 被普通保存改写。</p>
          </section>

          <section class="subpanel">
            <h2>版本历史</h2>
            <ul class="version-list">
              <li v-for="version in detail?.versions ?? []" :key="version.id">
                <div><strong>#{{ version.id }}</strong> <span class="pill">{{ version.kind === 'autosave' ? '自动' : '手动' }}</span> <span v-if="version.id === article.publishedVersionId" class="pill published">已发布</span> <span v-if="version.id === article.liveVersionId" class="pill live">已上线</span></div>
                <div class="row-actions"><button type="button" :disabled="busy || saving" @click="openVersion(version)">载入</button><button type="button" :disabled="busy || saving || version.id === article.publishedVersionId" @click="rollbackTo(version)">回滚</button></div>
              </li>
            </ul>
          </section>

          <MediaLibrary
            :group="article.slug.split('/').pop()"
            :replacing="selectedImage !== null"
            @insert="insertAsset"
            @cover="useAsCover"
          />

          <section class="subpanel">
            <h2>生产渲染预览</h2>
            <button type="button" :disabled="previewing" @click="refreshPreview">{{ previewing ? '渲染中…' : '渲染当前正文' }}</button>
            <iframe v-if="previewHtml" class="preview" sandbox="allow-same-origin" title="草稿的生产渲染预览" :srcdoc="previewHtml"></iframe>
            <p class="note">使用生产 remark/rehype 管线；预览不执行脚本，也不会保存或发布。</p>
          </section>
        </aside>
      </div>
    </main>
    <main v-else class="admin-wrap"><p class="message">正在读取文章…</p><p v-if="failure" class="message error" role="alert">{{ failure }}</p></main>
  `,
});
