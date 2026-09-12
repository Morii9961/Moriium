---
title: 傅里叶级数的一页笔记
slug: zh/fourier-notes
summary: 从三角函数系的正交性出发，推到方波的傅里叶级数，顺便检查行内公式、块级公式、矩阵、分段函数、超长公式，以及公式渲染失败时的样子。
publishedAt: 2026-09-05T22:10:00+08:00
lang: zh
translationKey: testbed-fourier
category: 学习笔记
tags:
  - 数学
  - 信号处理
  - 测试
draft: false
unlisted: false
copyProtection: false
---

周期为 $2\pi$ 的函数 $f(x)$，只要足够「好」，就可以写成一组正弦和余弦的叠加。这件事的关键不在公式本身，而在于三角函数系在区间 $[-\pi, \pi]$ 上彼此正交。

## 正交性

对任意正整数 $m, n$，有

$$
\int_{-\pi}^{\pi} \sin(mx)\cos(nx)\,dx = 0
$$

以及

$$
\int_{-\pi}^{\pi} \cos(mx)\cos(nx)\,dx =
\begin{cases}
\pi, & m = n \\
0, & m \neq n
\end{cases}
$$

## 系数公式

利用正交性，两边同乘 $\cos(nx)$ 再积分，就能把系数一个个「筛」出来：

$$
\begin{aligned}
a_0 &= \frac{1}{\pi}\int_{-\pi}^{\pi} f(x)\,dx \\
a_n &= \frac{1}{\pi}\int_{-\pi}^{\pi} f(x)\cos(nx)\,dx \\
b_n &= \frac{1}{\pi}\int_{-\pi}^{\pi} f(x)\sin(nx)\,dx
\end{aligned}
$$

于是

$$
f(x) \sim \frac{a_0}{2} + \sum_{n=1}^{\infty}\bigl(a_n\cos(nx) + b_n\sin(nx)\bigr)
$$

## 例子：方波

取方波

$$
f(x) = \begin{cases} -1, & -\pi < x < 0 \\ \phantom{-}1, & 0 < x < \pi \end{cases}
$$

它是奇函数，所以 $a_n = 0$，只需要算 $b_n$：

$$
b_n = \frac{2}{\pi}\int_0^{\pi}\sin(nx)\,dx = \frac{2}{n\pi}\bigl(1 - \cos(n\pi)\bigr) =
\begin{cases} \dfrac{4}{n\pi}, & n \text{ 为奇数} \\ 0, & n \text{ 为偶数} \end{cases}
$$

最终

$$
f(x) = \frac{4}{\pi}\left(\sin x + \frac{\sin 3x}{3} + \frac{\sin 5x}{5} + \cdots\right)
$$

在 $x = \pi/2$ 处代入，就得到了莱布尼茨级数 $1 - \tfrac{1}{3} + \tfrac{1}{5} - \cdots = \tfrac{\pi}{4}$。

## 矩阵与向量

离散情形下，傅里叶变换可以看成一个矩阵。$N = 4$ 时：

$$
\mathbf{F} = \frac{1}{2}
\begin{pmatrix}
1 & 1 & 1 & 1 \\
1 & -i & -1 & i \\
1 & -1 & 1 & -1 \\
1 & i & -1 & -i
\end{pmatrix},
\qquad
\mathbf{F}^{\mathsf{H}}\mathbf{F} = \mathbf{I}
$$

## 很长的公式

下面这条故意写得很长，用来检查块级公式在窄屏上是横向滚动还是溢出页面：

$$
S_N(x) = \frac{4}{\pi}\left(\sin x + \frac{\sin 3x}{3} + \frac{\sin 5x}{5} + \frac{\sin 7x}{7} + \frac{\sin 9x}{9} + \frac{\sin 11x}{11} + \frac{\sin 13x}{13} + \frac{\sin 15x}{15} + \frac{\sin 17x}{17} + \frac{\sin 19x}{19}\right)
$$

## 表格与列表中的公式

| 级数 | 和 |
| --- | --- |
| $\sum_{n\ge1} 1/n^2$ | $\pi^2/6$ |
| $\sum_{n\ge0} (-1)^n/(2n+1)$ | $\pi/4$ |
| $\sum_{n\ge0} x^n/n!$ | $e^x$ |

- 吉布斯现象：在间断点附近，部分和的过冲约为跳变幅度的 $9\%$，不会随 $N$ 增大而消失。
- 帕塞瓦尔等式：$\frac{1}{\pi}\int_{-\pi}^{\pi}f(x)^2\,dx = \frac{a_0^2}{2} + \sum_{n=1}^{\infty}(a_n^2 + b_n^2)$。

## 美元符号与渲染失败

价格写作 \$19.99 时，美元符号要转义，否则会被当成公式的开头。

下面这个公式故意用了一个不存在的命令，它应该显示为错误提示，而不是让整篇文章构建失败：$\notarealcommand{x}$。
