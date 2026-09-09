import { computed, defineComponent, onMounted, ref, watch } from 'vue';
import ArticleEditor from './ArticleEditor.ts';
import {
  LANGUAGES,
  composeSlug,
  languagesLeftInGroup,
  slugBodyFromTitle,
  slugBodyOf,
  translationKeyFor,
} from './slug.ts';
import {
  api,
  ApiError,
  messageForApiFailure,
  messageForSignInFailure,
  type ArticleRow,
  type Author,
  type NewArticleInput,
  type OperationalStatus,
  type Verdict,
} from './api.ts';

function newArticle(): NewArticleInput {
  return {
    translationKey: '',
    lang: 'zh',
    slug: '',
    title: '',
    summary: '',
    publishedAt: new Date().toISOString(),
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
  name: 'MoriiumAdmin',
  components: { ArticleEditor },
  setup() {
    const initializing = ref(true);
    const author = ref<Author | null>(null);
    const name = ref('');
    const password = ref('');
    const failure = ref('');
    const busy = ref(false);
    const articles = ref<ArticleRow[]>([]);
    const openId = ref<number | null>(null);
    const creating = ref(false);
    const draft = ref<NewArticleInput>(newArticle());
    const tagsText = ref('');
    const status = ref<OperationalStatus | null>(null);
    const checkingStatus = ref(false);
    const signedIn = computed(() => author.value !== null);
    const createMode = ref<'new' | 'translation'>('new');
    const sourceId = ref<number | null>(null);
    // Set once the author edits the slug by hand, after which the title stops
    // overwriting it. Without this, correcting a slug and then fixing a typo in
    // the title would silently throw the correction away.
    const slugTouched = ref(false);
    // Not a ref: only loadStatus reads it, and nothing renders from it.
    let statusRequest = 0;

    /**
     * The four states of docs/vps-acceptance-checklist.md section E.
     *
     * Each verdict gets its own word. `unknown` says the reading is missing
     * rather than borrowing either reassuring label, which is the whole reason
     * the fourth state exists.
     */
    const VERDICT_LABELS: Record<Verdict, string> = {
      ok: '正常',
      attention: '需要注意',
      failure: '失败',
      unknown: '未观测',
    };

    function verdictLabel(verdict: Verdict): string {
      return VERDICT_LABELS[verdict] ?? VERDICT_LABELS.unknown;
    }

    /** When this row's own reading was taken, or that there is none. */
    function observedLabel(observedAt: string | null): string {
      if (!observedAt) return '暂无读数';
      const at = new Date(observedAt);
      if (Number.isNaN(at.getTime())) return '读数时间无法解析';
      return `读数时间 ${at.toLocaleString()}`;
    }

    function checkedLabel(checkedAt: string): string {
      const at = new Date(checkedAt);
      if (Number.isNaN(at.getTime())) return '本次检查时间无法解析';
      return `本次检查 ${at.toLocaleString()}`;
    }

    /**
     * Drops every trace of the signed-in author and returns to the login form.
     *
     * Called on any 401. Leaving the shell showing "已登录" beside a stale
     * article list is worse than an error: it claims a session that the server
     * has already destroyed, and the drafts on screen belong to it.
     */
    function endSession(): void {
      author.value = null;
      articles.value = [];
      openId.value = null;
      status.value = null;
      creating.value = false;
      draft.value = newArticle();
      resetCreateForm();
      tagsText.value = '';
    }

    /** Clears the derived-identity state that lives outside the draft object. */
    function resetCreateForm(): void {
      createMode.value = 'new';
      sourceId.value = null;
      slugTouched.value = false;
    }

    /** The article this entry translates, when the author picked one. */
    const sourceArticle = computed(() =>
      articles.value.find((row) => row.article.id === sourceId.value) ?? null,
    );

    /** Languages the chosen group still has room for; all three for a new one. */
    const availableLanguages = computed(() => {
      const source = sourceArticle.value;
      if (!source) return [...LANGUAGES];
      const rows = articles.value.map((row) => row.article);
      return languagesLeftInGroup(rows, source.article.translationKey);
    });

    /**
     * The slug without its language prefix.
     *
     * The prefix exists so Astro's collection ids stay unique across variants
     * (`src/content-schema.ts`); it follows from the language and was never a
     * decision, so the form composes it rather than asking for it.
     */
    const slugBody = computed({
      get: () => slugBodyOf(draft.value.slug),
      set: (body: string) => {
        slugTouched.value = true;
        draft.value.slug = composeSlug(draft.value.lang, body);
      },
    });

    const articleUrlPreview = computed(
      () => `/${draft.value.lang}/posts/${slugBodyOf(draft.value.slug) || '…'}/`,
    );

    /** Only articles whose group still has a free language can be translated. */
    const translatableArticles = computed(() =>
      articles.value.filter((row) => {
        const rows = articles.value.map((entry) => entry.article);
        return languagesLeftInGroup(rows, row.article.translationKey).length > 0;
      }),
    );

    /** Recomposes slug and key whenever anything they derive from moves. */
    function syncDerivedIdentity(): void {
      const source = sourceArticle.value;
      if (createMode.value === 'translation' && source) {
        // A translation shares its source's slug body, which is what makes the
        // three variants resolve to the same route segment under /zh/, /ja/
        // and /en/.
        if (!slugTouched.value) draft.value.slug = composeSlug(draft.value.lang, slugBodyOf(source.article.slug));
        else draft.value.slug = composeSlug(draft.value.lang, slugBodyOf(draft.value.slug));
        draft.value.translationKey = translationKeyFor({
          mode: 'translation',
          slugBody: slugBodyOf(draft.value.slug),
          source: source.article,
        });
        return;
      }
      if (!slugTouched.value) {
        draft.value.slug = composeSlug(
          draft.value.lang,
          slugBodyFromTitle(draft.value.title, new Date()),
        );
      } else {
        draft.value.slug = composeSlug(draft.value.lang, slugBodyOf(draft.value.slug));
      }
      draft.value.translationKey = translationKeyFor({
        mode: 'new',
        slugBody: slugBodyOf(draft.value.slug),
      });
    }

    watch(
      [() => draft.value.title, () => draft.value.lang, createMode, sourceId],
      () => {
        // Switching to a language the group already holds would be refused by
        // the publish gate later; correct it here instead.
        if (!availableLanguages.value.includes(draft.value.lang) && availableLanguages.value[0]) {
          draft.value.lang = availableLanguages.value[0];
        }
        syncDerivedIdentity();
      },
    );

    function report(error: unknown): void {
      if (error instanceof ApiError && error.status === 401) {
        endSession();
        failure.value = '会话已过期，请重新登录。';
        return;
      }
      failure.value = messageForApiFailure(error, '后台连接失败。请检查网络后重试。');
    }

    async function refresh(): Promise<void> {
      articles.value = (await api.listArticles()).articles;
    }

    /**
     * Fetches the panel, and shows `unknown` when the fetch itself fails.
     *
     * Checklist item E4: the panel failing has to read as "no reading", not as
     * a blank section. `messageForApiFailure` keeps the browser's own
     * `TypeError: Failed to fetch` off screen (ADR 0002 section 21.14).
     *
     * The sequence number is what makes the re-check button honest. A second
     * click is already blocked while one request is open, but `bootstrap`,
     * `signIn` and `backToList` all call this too, and a slow earlier response
     * landing after a newer one would leave the panel showing older readings
     * than the timestamp beside them claims.
     */
    async function loadStatus(): Promise<void> {
      statusRequest += 1;
      const mine = statusRequest;
      checkingStatus.value = true;
      try {
        const next = await api.status();
        if (mine !== statusRequest) return;
        status.value = next;
      } catch (error) {
        if (mine !== statusRequest) return;
        // A 401 is not a missing reading, it is the end of the session. Drawing
        // it as an `unknown` row would leave the author looking at a panel that
        // implies they are still signed in.
        if (error instanceof ApiError && error.status === 401) {
          endSession();
          failure.value = '会话已过期，请重新登录。';
          return;
        }
        status.value = {
          checkedAt: new Date().toISOString(),
          items: [
            {
              id: 'panel',
              label: '运维状态',
              verdict: 'unknown',
              detail: messageForApiFailure(error, '后台连接失败。请检查网络后重试。'),
              observedAt: null,
            },
          ],
        };
      } finally {
        if (mine === statusRequest) checkingStatus.value = false;
      }
    }

    /**
     * Loads the article list and the operations panel without letting either
     * failure hide the other.
     *
     * They used to be awaited in sequence inside one try, so a failing article
     * list skipped loadStatus() entirely and the panel simply did not render.
     * That is the failure mode section E exists to prevent, one level up: the
     * panel is the only thing that reports a silent failure, so it must not be
     * the thing a silent failure removes. loadStatus() reports its own trouble
     * as an `unknown` row, so the article list's error is the only one `report`
     * has to carry.
     */
    async function loadAuthorViews(): Promise<void> {
      const [articles] = await Promise.allSettled([refresh(), loadStatus()]);
      if (articles.status === 'rejected') report(articles.reason);
    }

    async function bootstrap(): Promise<void> {
      try {
        author.value = await api.session();
        if (author.value) await loadAuthorViews();
      } catch (error) {
        report(error);
      } finally {
        initializing.value = false;
      }
    }

    async function signIn(): Promise<void> {
      busy.value = true;
      failure.value = '';
      try {
        let signedIn: Author;
        try {
          signedIn = await api.login(name.value, password.value);
        } catch (error) {
          // Only the login call gets this handler. `report` answers every 401
          // with "会话已过期", which is right for the calls below -- they run
          // with a session that can end -- and wrong for this one, where a 401
          // means the credential was refused and there was never a session.
          failure.value = messageForSignInFailure(error);
          return;
        }
        author.value = signedIn;
        password.value = '';
        await loadAuthorViews();
      } catch (error) {
        report(error);
      } finally {
        busy.value = false;
      }
    }

    async function signOut(): Promise<void> {
      busy.value = true;
      failure.value = '';
      try {
        await api.logout();
        endSession();
      } catch (error) {
        report(error);
      } finally {
        busy.value = false;
      }
    }

    async function create(): Promise<void> {
      busy.value = true;
      failure.value = '';
      try {
        const input: NewArticleInput = {
          ...draft.value,
          tags: [...new Set(tagsText.value.split(/[,\n]/).map((tag) => tag.trim()).filter(Boolean))],
          cover: draft.value.cover?.trim() || null,
          coverAlt: draft.value.coverAlt?.trim() || null,
          updatedAt: draft.value.updatedAt?.trim() || null,
        };
        const result = await api.createArticle(input);
        draft.value = newArticle();
        resetCreateForm();
        tagsText.value = '';
        creating.value = false;
        await refresh();
        openId.value = result.article.id;
      } catch (error) {
        report(error);
      } finally {
        busy.value = false;
      }
    }

    async function backToList(): Promise<void> {
      openId.value = null;
      await loadAuthorViews();
    }

    onMounted(() => void bootstrap());

    return {
      initializing,
      author,
      signedIn,
      name,
      password,
      failure,
      busy,
      articles,
      openId,
      creating,
      draft,
      createMode,
      sourceId,
      slugBody,
      availableLanguages,
      translatableArticles,
      articleUrlPreview,
      LANGUAGES,
      tagsText,
      status,
      checkingStatus,
      loadStatus,
      verdictLabel,
      observedLabel,
      checkedLabel,
      signIn,
      signOut,
      create,
      backToList,
    };
  },
  template: `
    <div v-if="initializing" class="login-shell"><p class="message">正在恢复作者会话…</p></div>

    <div v-else-if="!signedIn" class="login-shell">
      <form class="login-panel" @submit.prevent="signIn">
        <p class="eyebrow">Moriium</p>
        <h1>作者后台</h1>
        <p class="note">仅限已建立的 Morii 与 Enouia 账户。</p>
        <label><span>账户名</span><input v-model="name" autocomplete="username" required /></label>
        <label><span>口令</span><input v-model="password" type="password" autocomplete="current-password" required /></label>
        <button class="primary wide" type="submit" :disabled="busy || !name || !password">{{ busy ? '登录中…' : '登录' }}</button>
        <p v-if="failure" class="message error" role="alert">{{ failure }}</p>
      </form>
    </div>

    <ArticleEditor v-else-if="openId !== null" :article-id="openId" @back="backToList" />

    <main v-else class="admin-wrap">
      <header class="admin-header">
        <div><p class="eyebrow">Moriium</p><h1>文章</h1><p class="note">当前账户：{{ author?.name }}</p></div>
        <div class="header-actions"><button type="button" @click="creating = !creating">{{ creating ? '取消新建' : '新建文章' }}</button><button type="button" class="quiet" :disabled="busy" @click="signOut">退出</button></div>
      </header>

      <p v-if="failure" class="message error" role="alert">{{ failure }}</p>

      <form v-if="creating" class="create-panel" @submit.prevent="create">
        <div class="section-heading"><div><p class="eyebrow">Article / New</p><h2>新建文章</h2></div><p class="note">语言、slug 与 translationKey 建立后不可通过保存版本修改。</p></div>
        <div class="form-grid two">
          <label><span>这是什么</span><select v-model="createMode"><option value="new">一篇新文章</option><option value="translation">已有文章的译文</option></select></label>
          <label v-if="createMode === 'translation'"><span>翻译自</span><select v-model="sourceId"><option :value="null" disabled>选择原文</option><option v-for="row in translatableArticles" :key="row.article.id" :value="row.article.id">{{ row.latest?.title || '未命名文章' }}（{{ row.article.lang }}）</option></select></label>
          <label v-else><span>语言</span><select v-model="draft.lang"><option v-for="lang in LANGUAGES" :key="lang" :value="lang">{{ lang }}</option></select></label>
        </div>
        <div class="form-grid two">
          <label v-if="createMode === 'translation'"><span>译文语言</span><select v-model="draft.lang"><option v-for="lang in availableLanguages" :key="lang" :value="lang">{{ lang }}</option></select></label>
          <label><span>slug</span><input v-model="slugBody" required /></label>
        </div>
        <p class="note">公开网址 <code>{{ articleUrlPreview }}</code>　翻译组 <code>{{ draft.translationKey || '（待定）' }}</code></p>
        <div class="form-grid two">
          <label><span>标题</span><input v-model="draft.title" required /></label>
          <label><span>分类</span><input v-model="draft.category" required /></label>
        </div>
        <label><span>摘要</span><textarea v-model="draft.summary" rows="3" maxlength="280" required></textarea></label>
        <div class="form-grid two">
          <label><span>发布日期（ISO 8601）</span><input v-model="draft.publishedAt" required /></label>
          <label><span>更新日期（可空）</span><input :value="draft.updatedAt ?? ''" @input="draft.updatedAt = $event.target.value || null" /></label>
        </div>
        <label><span>标签（逗号或换行分隔）</span><textarea v-model="tagsText" rows="2"></textarea></label>
        <div class="form-grid two">
          <label><span>封面公开路径（可空）</span><input :value="draft.cover ?? ''" @input="draft.cover = $event.target.value || null" /></label>
          <label><span>封面替代文字</span><input :value="draft.coverAlt ?? ''" @input="draft.coverAlt = $event.target.value || null" /></label>
        </div>
        <fieldset class="checks"><legend>发布属性</legend><label><input v-model="draft.draft" type="checkbox" /> 保留为草稿（不可发布）</label><label><input v-model="draft.unlisted" type="checkbox" /> 不在列表中显示</label><label><input v-model="draft.copyProtection" type="checkbox" /> 启用复制限制</label></fieldset>
        <label><span>初始 Markdown</span><textarea v-model="draft.markdown" rows="6" required></textarea></label>
        <button class="primary" type="submit" :disabled="busy">{{ busy ? '创建中…' : '创建并打开' }}</button>
      </form>

      <section v-if="status" class="status-panel" aria-labelledby="status-title">
        <div class="section-heading">
          <div><p class="eyebrow">Admin / Operations</p><h2 id="status-title">运维状态</h2></div>
          <button type="button" class="quiet" :disabled="checkingStatus" @click="loadStatus">{{ checkingStatus ? '检查中…' : '重新检查' }}</button>
        </div>
        <p class="note">此面板不主动告警。需要注意、失败与未观测状态均会列出。{{ checkedLabel(status.checkedAt) }}。</p>
        <ul class="status-items">
          <li v-for="item in status.items" :key="item.id" :class="['status-item', 'verdict-' + item.verdict]">
            <span class="status-label">{{ item.label }}</span>
            <span class="status-detail">{{ item.detail }}</span>
            <span class="status-observed">{{ observedLabel(item.observedAt) }}</span>
            <span :class="['pill', 'verdict-' + item.verdict]">{{ verdictLabel(item.verdict) }}</span>
          </li>
        </ul>
      </section>

      <section class="article-list" aria-labelledby="article-list-title">
        <div class="section-heading"><h2 id="article-list-title">全部文章</h2><span class="note">{{ articles.length }} 篇</span></div>
        <p v-if="articles.length === 0" class="empty">暂无文章。</p>
        <button v-for="row in articles" :key="row.article.id" type="button" class="article-row" @click="openId = row.article.id">
          <span class="article-identity"><strong>{{ row.latest?.title || '未命名文章' }}</strong><small>{{ row.article.lang }} · {{ row.article.slug }}</small></span>
          <span class="article-states"><span v-if="row.article.publishedVersionId === null" class="pill draft">草稿</span><span v-else class="pill published">已发布 #{{ row.article.publishedVersionId }}</span><span v-if="row.article.liveVersionId !== null" class="pill live">已上线 #{{ row.article.liveVersionId }}</span><span v-if="row.awaitingExport" class="pill waiting">等待导出</span><span v-if="row.hasUnpublishedChanges" class="pill changed">有未发布改动</span></span>
          <span aria-hidden="true">→</span>
        </button>
      </section>
    </main>
  `,
});
