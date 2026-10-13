<script setup lang="ts">
useSeoMeta({
  title: 'Zeno Studio — Photo Workflow',
  description: 'Từ lựa chọn ảnh đến bàn giao, một luồng làm việc rõ ràng cho studio và khách hàng.',
})
</script>

<template>
  <div class="min-h-screen bg-[#f8f7f3] text-[#24231f]">
    <header class="mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-8">
      <NuxtLink to="/" class="flex items-center gap-3 text-lg font-bold tracking-tight">
        <span class="grid size-9 place-items-center rounded-xl bg-[#344732] text-lg text-white">Z</span>
        Zeno Studio
      </NuxtLink>
      <nav class="flex items-center gap-3 text-sm font-medium">
        <NuxtLink to="/tools/file-filter" class="rounded-full border border-[#d8dbd0] px-4 py-2.5 transition hover:border-[#344732]">Lọc file trên máy</NuxtLink>
        <NuxtLink to="/studio" class="hidden rounded-full bg-[#344732] px-4 py-2.5 text-white transition hover:bg-[#263825] sm:inline-flex">Vào studio</NuxtLink>
      </nav>
    </header>

    <main>
      <section class="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.1fr_.9fr] lg:pb-28 lg:pt-24">
        <div>
          <p class="mb-5 inline-flex items-center gap-2 rounded-full border border-[#ced6c6] bg-[#eef3e8] px-4 py-2 text-xs font-semibold uppercase tracking-[.18em] text-[#486443]">Quy trình ảnh liền mạch</p>
          <h1 class="max-w-3xl text-5xl font-semibold leading-[1.08] tracking-[-.045em] sm:text-6xl lg:text-[5.1rem]">Từ bộ ảnh đầu tiên đến lời <em class="font-serif font-normal text-[#6d8559]">“ưng rồi”.</em></h1>
          <p class="mt-7 max-w-xl text-lg leading-8 text-[#67675f]">Một nơi để khách chọn ảnh, ghi chú mong muốn chỉnh sửa và duyệt thành phẩm. Studio theo dõi từng bước, tìm đúng file và bàn giao gọn gàng.</p>
          <div class="mt-9 flex flex-wrap gap-3">
            <NuxtLink to="/studio" class="rounded-full bg-[#344732] px-6 py-3.5 font-semibold text-white shadow-lg shadow-[#344732]/15 transition hover:bg-[#263825]">Mở studio <span aria-hidden="true">↗</span></NuxtLink>
            <NuxtLink to="/tools/file-filter" class="rounded-full border border-[#cfd5c9] bg-white px-6 py-3.5 font-semibold transition hover:border-[#6d8559]">Dùng công cụ lọc file</NuxtLink>
          </div>
          <div class="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-[#dedfd6] pt-6 text-sm">
            <p><strong class="block text-2xl text-[#344732]">01</strong><span class="text-[#74766f]">Gửi album</span></p>
            <p><strong class="block text-2xl text-[#344732]">02</strong><span class="text-[#74766f]">Khách chọn & ghi chú</span></p>
            <p><strong class="block text-2xl text-[#344732]">03</strong><span class="text-[#74766f]">Duyệt & bàn giao</span></p>
          </div>
        </div>

        <div class="relative mx-auto w-full max-w-[520px]">
          <div class="absolute -left-6 -top-8 size-36 rounded-full bg-[#dce8d0] blur-3xl" />
          <div class="relative rounded-[2rem] border border-[#e0dfd7] bg-white p-4 shadow-[0_35px_90px_-35px_rgba(39,55,35,.34)] sm:p-5">
            <div class="flex items-center justify-between px-2 pb-4 text-xs text-[#777a72]"><span class="font-semibold text-[#344732]">Album · Mai & Quang</span><span>124 ảnh · Đang chọn</span></div>
            <div class="grid grid-cols-2 gap-3">
              <div class="aspect-[.88] rounded-2xl bg-[linear-gradient(150deg,#d8d0bc,#eee9de_47%,#9aab92)] p-3"><span class="grid size-8 place-items-center rounded-full bg-white/90 text-[#bd6263]">♥</span></div>
              <div class="aspect-[.88] rounded-2xl bg-[linear-gradient(145deg,#bfc9b2,#f4e6d5_54%,#d9baa0)] p-3"><span class="grid size-8 place-items-center rounded-full bg-white/90 text-[#bd6263]">♥</span></div>
              <div class="aspect-[1.35] rounded-2xl bg-[linear-gradient(135deg,#cec4b0,#e4d9c3_52%,#9aa68f)]" />
              <div class="aspect-[1.35] rounded-2xl bg-[linear-gradient(130deg,#abc0aa,#e7e7d7_50%,#bca991)]" />
            </div>
            <div class="mt-4 flex items-center justify-between rounded-2xl bg-[#eef3e8] px-4 py-3 text-sm"><span><strong class="text-[#344732]">18 ảnh</strong> đã chọn</span><span class="font-semibold text-[#344732]">Xem lựa chọn →</span></div>
          </div>
          <div class="absolute -bottom-7 -left-4 rounded-2xl border border-[#e1e2d9] bg-white px-4 py-3 shadow-xl sm:-left-12"><span class="block text-xs text-[#85877e]">Ghi chú ảnh #024</span><span class="mt-1 block text-sm font-medium">“Chỉnh sáng nhẹ giúp mình nhé”</span></div>
        </div>
      </section>

      <section class="bg-[#e9eee4] py-16">
        <div class="mx-auto max-w-7xl px-5 sm:px-8">
          <p class="text-sm font-semibold uppercase tracking-[.2em] text-[#698365]">Một workflow, trọn hành trình</p>
          <div class="mt-7 grid gap-4 md:grid-cols-3">
            <article v-for="item in [
              ['01', 'Chọn ảnh dễ hơn', 'Khách chọn và ghi chú trên từng ảnh ngay từ điện thoại, không cần tạo tài khoản.'],
              ['02', 'Hậu kỳ chính xác', 'Studio nhận tên file và yêu cầu chỉnh sửa, sau đó lọc RAW/JPEG ngay trên máy.'],
              ['03', 'Duyệt rõ ràng', 'Mỗi vòng review được lưu lại để cả hai bên biết ảnh nào cần sửa và khi nào hoàn tất.'],
            ]" :key="item[0]" class="rounded-[1.5rem] bg-white p-7 shadow-sm">
              <span class="text-sm font-semibold text-[#78916e]">{{ item[0] }}</span>
              <h2 class="mt-8 text-2xl font-semibold tracking-tight">{{ item[1] }}</h2>
              <p class="mt-3 leading-7 text-[#6b6d65]">{{ item[2] }}</p>
            </article>
          </div>
        </div>
      </section>
    </main>
    <footer class="mx-auto flex max-w-7xl flex-wrap justify-between gap-3 px-5 py-8 text-sm text-[#81837b] sm:px-8"><span>© Zeno Studio</span><span>Cho những bức ảnh đáng giữ lại.</span></footer>
  </div>
</template>
