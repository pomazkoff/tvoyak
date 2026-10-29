"""Генератор бесшовной текстуры мятой бумаги для листов (public/paper/crumple.webp).

Почти белая карта для background-blend-mode: multiply: освещённые грани
остаются цветом листа, затенённые грани и заломы мягко темнеют.
Рельеф — «шатры» над ячейками Вороного (заломы по границам ячеек),
освещённые косым светом. Запуск: python3 scripts/gen-paper-texture.py
"""

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter
from scipy.spatial import cKDTree

S = 512
rng = np.random.default_rng(11)
yy, xx = np.mgrid[0:S, 0:S].astype(np.float64)
pix = np.stack([xx.ravel(), yy.ravel()], axis=1)


def relief(n, amp):
    pts = rng.uniform(0, S, size=(n, 2))
    d, i = cKDTree(pts, boxsize=S).query(pix, k=2)
    # Часть ячеек выпуклая, часть вдавленная: получаются и гребни, и ложбины.
    sign = rng.choice([-1.0, 1.0], size=n, p=[0.35, 0.65])
    tent = np.minimum(d[:, 1] - d[:, 0], S / np.sqrt(n)) * sign[i[:, 0]]
    return tent.reshape(S, S) * amp


h = relief(9, 1.0) + relief(34, 0.55) + relief(120, 0.22)
h = gaussian_filter(h, 1.1, mode="wrap")
gy, gx = np.gradient(np.pad(h, 1, mode="wrap"))
gx, gy = gx[1:-1, 1:-1], gy[1:-1, 1:-1]
k = 0.9
nx, ny, nz = -gx * k, -gy * k, np.ones_like(h)
norm = np.sqrt(nx**2 + ny**2 + nz**2)
light = np.array([-0.45, -0.6, 0.66])
light /= np.linalg.norm(light)
lum = (nx * light[0] + ny * light[1] + nz * light[2]) / norm
lum += gaussian_filter(rng.normal(0, 1, (S, S)), 0.7, mode="wrap") * 0.006

# Типичная грань чуть темнее листа, светлые грани = цвет листа,
# глубокие тени ≈ −7% яркости.
deep, mid, lit = np.percentile(lum, [2, 50, 97])
up = np.clip((lum - mid) / (lit - mid), 0, 1) * 7
down = np.clip((mid - lum) / (mid - deep), 0, 1.2) * 14
img = 248 + up - down
img = np.clip(img, 0, 255).astype(np.uint8)
Image.fromarray(img, "L").save(
    "public/paper/crumple.webp", "WEBP", quality=82, method=6
)
print("ok", img.min(), img.max(), img.mean().round(1))
