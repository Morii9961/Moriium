<script setup lang="ts">
import { ref } from 'vue';
import ArticleEditor from './ArticleEditor.vue';
import { api, ApiError, type ArticleRow, type Language } from './api.ts';

const signedIn = ref(false);
const password = ref('');
const failure = ref('');
const busy = ref(false);

const articles = ref<ArticleRow[]>([]);
const openId = ref<number | null>(null);

const creating = ref(false);
const draft = ref({ translationKey: '', lang: 'zh' as Language, slug: '', title: '', summary: '' });

function report(error: unknown): void {
  failure.value = error instanceof ApiError ? error.message : String(error);
}

async function refresh(): Promise<void> {
  try {
    articles.value = (await api.listArticles()).articles;
  } catch (error) {
    report(error);
  }
}

async function signIn(): Promise<void> {
  busy.value = true;
  failure.value = '';
  try {
    await api.login(password.value);
    password.value = '';
    signedIn.value = true;
    await refresh();
  } catch (error) {
    report(error);
  } finally {
    busy.value = false;
  }
}

async function signOut(): Promise<void> {
  try {
    await api.logout();
  } catch (error) {
    report(error);
  }
  signedIn.value = false;
  openId.value = null;
  articles.value = [];
}

async function create(): Promise<void> {
  busy.value = true;
  failure.value = '';
  try {
    const result = await api.createArticle({ ...draft.value, markdown: '写点什么。\n' });
    creating.value = false;
    draft.value = { translationKey: '', lang: 'zh', slug: '', title: '', summary: '' };
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
  await refresh();
}
</script>

<template>
  <div class="bar">
    <h1>Moriium 原型 B</h1>
    <span class="grow"></span>
    <button v-if="signedIn" @click="signOut">退出</button>
  </div>

  <!-- Sessions live in memory, so a reload genuinely signs Morii out. -->
  <form v-if="!signedIn" class="center" @submit.prevent="signIn">
    <div class="field">
      <label for="password">口令</label>
      <input id="password" v-model="password" type="password" autocomplete="current-password" />
    </div>
    <button class="primary" type="submit" :disabled="busy || !password">登录</button>
    <p v-if="failure" class="error">{{ failure }}</p>
    <p class="note" style="margin-top: 20px">
      原型的会话存在内存里，刷新页面即退出。本地 http 下 cookie 没有 Secure。
    </p>
  </form>

  <ArticleEditor v-else-if="openId !== null" :article-id="openId" @back="backToList" />

  <div v-else class="wrap">
    <p v-if="failure" class="error">{{ failure }}</p>

    <p>
      <button @click="creating = !creating">{{ creating ? '取消' : '新建文章' }}</button>
    </p>

    <div v-if="creating" class="panel" style="margin-bottom: 20px">
      <h2>新建</h2>
      <div class="field">
        <label for="lang">语言</label>
        <select id="lang" v-model="draft.lang">
          <option value="zh">zh</option>
          <option value="ja">ja</option>
          <option value="en">en</option>
        </select>
      </div>
      <div class="field">
        <label for="slug">slug（必须以语言开头，例如 zh/new-post）</label>
        <input id="slug" v-model="draft.slug" type="text" />
      </div>
      <div class="field">
        <label for="key">translationKey</label>
        <input id="key" v-model="draft.translationKey" type="text" />
      </div>
      <div class="field">
        <label for="newTitle">标题</label>
        <input id="newTitle" v-model="draft.title" type="text" />
      </div>
      <div class="field">
        <label for="newSummary">摘要</label>
        <input id="newSummary" v-model="draft.summary" type="text" />
      </div>
      <button class="primary" :disabled="busy" @click="create">创建</button>
    </div>

    <table>
      <thead>
        <tr>
          <th>slug</th>
          <th>语言</th>
          <th>标题</th>
          <th>状态</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in articles" :key="row.id">
          <td>{{ row.slug }}</td>
          <td>{{ row.lang }}</td>
          <td>{{ row.latest?.title ?? '—' }}</td>
          <td>
            <span class="tag" :class="row.publishedVersionId === null ? 'draft' : 'live'">
              {{ row.publishedVersionId === null ? '草稿' : '已发布' }}
            </span>
            <span
              v-if="row.hasUnpublishedChanges && row.publishedVersionId !== null"
              class="tag dirty"
              style="margin-left: 6px"
            >
              有未发布改动
            </span>
          </td>
          <td><button @click="openId = row.id">打开</button></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
