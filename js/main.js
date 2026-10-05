const inputSection = document.getElementById("input-section");
const mapSection = document.getElementById("map-section");
const form = document.getElementById("user-form");
const btndraw = document.getElementById("btn-draw");
const counterMsg = document.getElementById("counter-msg");
const winnerBanner = document.getElementById("winner-banner");

const scsLat = 33.51727738059502; 
const scsLng = 36.28511527220178
 
const users = [];
let map = null;
let mapElementsLayer = null; // طبقة لحفظ وتحديث عناصر الخريطة (الدوائر والعلامات) بسهولة

// إحداثيات المركز الرئيسي للجمعية (خط العرض وخط الطول الثابت)

const redIcon = L.divIcon({
  className: "custom-red-marker",
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  popupAnchor: [0, -14],
});

form.addEventListener("submit", (e) => {
  e.preventDefault();

  // استخراج البيانات المدخلة من النموذج وتحويلها إلى كائن (Object)
  const formdata = new FormData(form);
  const user = Object.fromEntries(formdata);

  users.push(user);
  console.log("تم إضافة مستفيد جديد:", user);

  if (counterMsg) {
    counterMsg.textContent = `تم إدخال: ${users.length} مستفيدين`;
  }

  alert(`تم الحفظ بنجاح! عدد الأشخاص: ${users.length}`);
  form.reset(); 
});

btndraw.addEventListener("click", () => {
  // التحقق من وجود مستفيدين على الأقل قبل الانتقال للخريطة
  if (users.length === 0) {
    alert("يرجى إدخال وتجميع بيانات شخص واحد على الأقل قبل التبديل للخريطة!");
    return;
  }

  inputSection.classList.add("hidden");
  mapSection.classList.remove("hidden");

  // تهيئة الخريطة للمرة الأولى فقط مع حدود جغرافية مقيدة لدولة سوريا
  if (!map) {
    const syriaBounds = [
      [32.2, 35.5],
      [37.4, 42.4],
    ];

    map = L.map("map", {
      maxBounds: syriaBounds,
      maxBoundsViscosity: 1.0,
    }).setView([scsLat, scsLng], 15);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);

    // وضع علامة المركز الرئيس
    L.marker([scsLat, scsLng], { icon: redIcon })
      .addTo(map)
      .bindPopup(
        "<div class='popup-rtl'><b>المركز الرئيسي</b><br>Bytes for Future</div>"
      )
      .openPopup();

    // إنشاء طبقة خاصة لاحتواء ماركرات المستفيدين والدائرة ليتم مسحها وتحديثها بسلاسة
    mapElementsLayer = L.featureGroup().addTo(map);
  }

  mapElementsLayer.clearLayers();

  let totalDistanceMeters = 0;
  const validUsers = [];

  // ا حساب المسافات الإحداثية لكل مستفيد عن المركز الرئيس
  // -----------------------------------------------------------------------------------------
  users.forEach((u) => {
    if (u.coordinates) {
      // تفكيك نص الإحداثيات (خط العرض, خط الطول) وتحويلها لأرقام عشرية
      const [lat, lng] = u.coordinates
        .split(",")
        .map((coord) => parseFloat(coord.trim()));

      if (!isNaN(lat) && !isNaN(lng)) {
        const userLatLng = L.latLng(lat, lng);

        // حساب الفارق الهندسي البسيط بين إحداثيات المركز والمستفيد
        const deltaLat = (lat - scsLat) * 111000;
        const deltaLng =
          (lng - scsLng) * 111000 * Math.cos((scsLat * Math.PI) / 180);
        const distanceInDegrees = Math.sqrt(
          deltaLat * deltaLat + deltaLng * deltaLng
        );
        // تحويل المسافة من درجات جغرافية إلى أمتار حقيقية تقريبياً (كل درجة تقارب 111 كيلومتر)
        const distanceInMeters = distanceInDegrees;

        // تخزين المسافة والإحداثيات داخل كائن المستفيد نفسه
        u.distanceMeters = distanceInMeters;
        u.latlng = userLatLng;

        totalDistanceMeters += distanceInMeters;
        validUsers.push(u);
      }
    }
  });

  if (validUsers.length === 0) return;

  // ا رسم نطاق الخدمة المجاني (دائرة مركزها المركز الرئيسي ونصف قطرها متوسط المسافات)
  // -----------------------------------------------------------------------------------------
  const averageDistance = totalDistanceMeters / validUsers.length;

  const freeZoneCircle = L.circle([scsLat, scsLng], {
    color: "#ff3300",
    fillColor: "#ffcc00",
    fillOpacity: 0.15,
    radius: averageDistance,
  }).addTo(mapElementsLayer);

  //  حساب التعويضات، وإيجاد الأقرب للمحيط
  // -----------------------------------------------------------------------------------------
  let resultsHTML = `<h4>إحصائيات المسافات والتعويضات</h4>`;
  resultsHTML += `<p class="text-gray">نصف قطر النطاق المجاني: <b>${(averageDistance / 1000).toFixed(2)} كم</b></p><hr>`;

  let closestUser = null; // متغير لتخزين المستفيد الأقرب لمحيط الدائرة
  let minDiffToEdge = Infinity; // الحد الأدنى للفارق المطلق عن المحيط

  validUsers.forEach((u) => {
    const distanceCenterKm = u.distanceMeters / 1000;

    // تصميم محتوى النافذة المنبثقة (Popup) الخاصة بكل مستفيد على الخريطة
    let popupContent = `
      <div class="popup-rtl">
        <b>الاسم:</b> ${u.fullName}<br>
        <b>الجنس:</b> ${u.gender === "male" ? "ذكر" : "أنثى"}<br>
        <b>البعد عن المركز:</b> ${distanceCenterKm.toFixed(2)} كم<br>
    `;

    // حساب الفارق المطلق للمسافة عن محيط الدائرة (سواء كان المستفيد داخلها أو خارجها) للمقارنة
    const absoluteDiff = Math.abs(u.distanceMeters - averageDistance);
    if (absoluteDiff < minDiffToEdge) {
      minDiffToEdge = absoluteDiff;
      closestUser = u; // تحديث المستفيد الأقرب للمحيط
    }

    const isOutside = u.distanceMeters > averageDistance;

    if (isOutside) {
      // حساب المسافة الفاصلة عن المحيط بالكلومتر وتقريبها لحساب قيمة التعويض المالي
      const distanceEdgeKm = (u.distanceMeters - averageDistance) / 1000;
      const roundedEdgeKm = Math.round(distanceEdgeKm);
      const allowance = roundedEdgeKm * 1000; // احتساب التعويض (لكل كيلومتر خارج المحيط مبلغ معين)

      popupContent += `<b class="text-red">البعد عن المحيط:</b> ${distanceEdgeKm.toFixed(2)} كم</div>`;

      // مستفيد
      resultsHTML += `
        <div class="result-card card-outside">
          <b>${u.fullName}</b> (خارج النطاق)<br>
          البعد عن المركز: ${distanceCenterKm.toFixed(2)} كم<br>
          البعد عن محيط الدائرة: <b>${distanceEdgeKm.toFixed(2)} كم</b><br>
          <b>التعويض المستحق: <span class="text-red">${allowance} ل.س</span></b>
        </div>
      `;
    } else {
      popupContent += `<b class="text-green">الموقع: داخل النطاق المجاني</b></div>`;

      /// غير مستفيد
      resultsHTML += `
        <div class="result-card card-inside">
          <b> <i class="fa-regular fa-user"></i>${u.fullName}</b> (داخل النطاق)<br>
          البعد عن المركز: ${distanceCenterKm.toFixed(2)} كم<br>
          <span class="text-green">لا يحتاج تعويض (ضمن النطاق المغطى)</span>
        </div>
      `;
    }

    const popupOptions = {
      autoClose: !isOutside,
      closeOnClick: !isOutside,
    };

    // إنشاء العلامة
    const marker = L.marker(u.latlng)
      .addTo(mapElementsLayer)
      .bindPopup(popupContent, popupOptions);

    if (isOutside) {
      marker.openPopup(); // إذا كان المستفيد خارج النطاق
    }
  });

  // اwinner
  if (closestUser) {
    const isClosestOutside = closestUser.distanceMeters > averageDistance;
    const statusText = isClosestOutside ? "خارج النطاق" : "داخل النطاق";

    resultsHTML += `
      <div class="card-winner">
        <h3><i class="fa-solid fa-trophy" style="color: rgb(255, 212, 59);"></i> الأقرب لمحيط الدائرة</h3>
        <p><b><i class="fa-regular fa-user"></i> الاسم: </b> ${closestUser.fullName}</p>
        <p><b>المسافة الفاصلة عن المحيط:</b> ${(minDiffToEdge / 1000).toFixed(2)} كم فقط!</p>
        <p><b>الحالة:</b> ${statusText}</p>
      </div>
    `;
  }
  winnerBanner.innerHTML = resultsHTML;

  //  لتشمل كافة العناصر والدائرة والمركز معاً
  // -----------------------------------------------------------------------------------------
  //تعديل زوم الخريطة تلقائيا 
  setTimeout(() => {
    map.invalidateSize();
    // دمج  حدود الدائرة الجغرافية المرسومة
    const fullBounds = mapElementsLayer
      .getBounds()
      .extend(freeZoneCircle.getBounds());

    // تمديد الحدود لتشمل إحداثيات المركز الرئيسي للجمعية أيضاً كإجراء احترازي
    fullBounds.extend([scsLat, scsLng]);

    //تحريك وتعديل زوم الخريطة تلقائي ن
    map.fitBounds(fullBounds, { padding: [40, 40] });
  }, 100);
});
////33.49770640454759, 36.316982062205774
// 33.53569983395064, 36.29647606123543
// 33.53819487926888, 36.36389918255057
 