import json
import re

DISEASES = [
    {
        "canonical": "Zika",
        "english": "Zika virus disease",
        "slug": "ZIKA",
        "category": "Viral / Mosquito-borne",
        "zoonotic": True,
        "desc": "Zika virus disease transmitted primarily by Aedes mosquitoes.",
        "aliases": [
            ("Zika", "en"), ("Zika virus", "en"), ("Zika fever", "en"), ("ZIKV", "en"),
            ("Zika", "id"), ("Virus Zika", "id"), ("Demam Zika", "id"),
            ("Zika", "ms"), ("Virus Zika", "ms"), ("Demam Zika", "ms"),
            ("ซิกา", "th"), ("ไข้ซิกา", "th"), ("ไวรัสซิกา", "th"),
            ("Zika", "vi"), ("sốt Zika", "vi"), ("vi rút Zika", "vi"), ("virus Zika", "vi"),
            ("Zika", "tl"), ("virus na Zika", "tl"), ("trangkasong Zika", "tl"),
            ("ဇီကာ", "my"), ("ဇီကာဗိုင်းရပ်စ်", "my"), ("ဇီကာဖျားနာ", "my"),
            ("ហ្ស៊ីកា", "km"), ("ជំងឺហ្ស៊ីកា", "km"), ("វីរុសហ្ស៊ីកា", "km"),
            ("ຊິກາ", "lo"), ("ໄຂ້ຊິກາ", "lo"), ("ໄວຣັສຊິກາ", "lo"),
            ("Zika", "tet"), ("moras Zika", "tet"), ("virus Zika", "tet"),
            ("Zika", "pt"), ("vírus Zika", "pt"), ("febre Zika", "pt"),
            ("寨卡", "zh"), ("寨卡病毒", "zh"), ("寨卡热", "zh"),
            ("ஜிகா", "ta"), ("ஜிகா வைரஸ்", "ta"),
        ]
    },
    {
        "canonical": "West Nile",
        "english": "West Nile virus infection",
        "slug": "WEST_NILE",
        "category": "Viral / Mosquito-borne",
        "zoonotic": True,
        "desc": "West Nile virus infection transmitted by mosquitoes.",
        "aliases": [
            ("West Nile", "en"), ("West Nile virus", "en"), ("West Nile fever", "en"), ("WNV", "en"),
            ("West Nile", "id"), ("Virus West Nile", "id"), ("Demam West Nile", "id"), ("Nil Barat", "id"),
            ("West Nile", "ms"), ("Virus West Nile", "ms"), ("Nil Barat", "ms"),
            ("เวสต์ไนล์", "th"), ("ไวรัสเวสต์ไนล์", "th"), ("ไข้เวสต์ไนล์", "th"),
            ("West Nile", "vi"), ("virus West Nile", "vi"), ("sốt West Nile", "vi"),
            ("West Nile", "tl"), ("virus ng West Nile", "tl"),
            ("ဝက်စ်နိုင်း", "my"), ("ဝက်စ်နိုင်းဗိုင်းရပ်စ်", "my"),
            ("នីលខាងលិច", "km"), ("វីរុសនីលខាងលិច", "km"),
            ("ເວສໄນລ໌", "lo"), ("ໄວຣັສເວສໄນລ໌", "lo"),
            ("West Nile", "tet"), ("moras West Nile", "tet"),
            ("Nilo Ocidental", "pt"), ("vírus do Nilo Ocidental", "pt"),
            ("西尼罗河病毒", "zh"), ("西尼罗病毒", "zh"),
            ("மேற்கு நைல் வைரஸ்", "ta"),
        ]
    },
    {
        "canonical": "Typhoid",
        "english": "Typhoid fever",
        "slug": "TYPHOID",
        "category": "Bacterial / Food-borne",
        "zoonotic": False,
        "desc": "Typhoid fever caused by Salmonella Typhi bacteria.",
        "aliases": [
            ("Typhoid", "en"), ("Typhoid fever", "en"), ("Enteric fever", "en"),
            ("Tifus", "id"), ("Tipus", "id"), ("Tipes", "id"), ("Demam Tifoid", "id"), ("Typhoid", "id"),
            ("Demam kepialu", "ms"), ("Kepialu", "ms"), ("Tifoid", "ms"),
            ("ไข้รากสาดน้อย", "th"), ("ไข้ไทฟอยด์", "th"), ("ไทฟอยด์", "th"),
            ("thương hàn", "vi"), ("sốt thương hàn", "vi"), ("bệnh thương hàn", "vi"),
            ("tipus", "tl"), ("lagnat na tipus", "tl"), ("typhoid", "tl"),
            ("တိုက်ဖွိုက်", "my"), ("အူရောင်ငန်းဖျား", "my"), ("အူရောင်ငန်းဖျားရောဂါ", "my"),
            ("គ្រុនពោះវៀន", "km"), ("ជំងឺគ្រុនពោះវៀន", "km"),
            ("ໄຂ້ໄທຟອຍ", "lo"), ("ໄຂ້ຮາກສາດ", "lo"), ("ໄທຟອຍ", "lo"),
            ("tifóide", "tet"), ("moras tifóide", "tet"), ("tifu", "tet"),
            ("febre tifóide", "pt"), ("tifoide", "pt"),
            ("伤寒", "zh"), ("副伤寒", "zh"),
            ("டைபாய்டு", "ta"), ("டைபாய்டு காய்ச்சல்", "ta"),
        ]
    },
    {
        "canonical": "Tuberculosis",
        "english": "Tuberculosis",
        "slug": "TUBERCULOSIS",
        "category": "Bacterial / Airborne",
        "zoonotic": False,
        "desc": "Infectious bacterial disease mainly affecting lungs caused by Mycobacterium tuberculosis.",
        "aliases": [
            ("Tuberculosis", "en"), ("TB", "en"), ("consumption", "en"),
            ("Tuberkulosis", "id"), ("TBC", "id"), ("TB paru", "id"), ("flek paru", "id"),
            ("Batuk kering", "ms"), ("Tibi", "ms"), ("Tuberkulosis", "ms"), ("Sakit tibi", "ms"),
            ("วัณโรค", "th"), ("โรควัณโรค", "th"), ("ทีบี", "th"),
            ("bệnh lao", "vi"), ("lao phổi", "vi"), ("vi trùng lao", "vi"), ("lao", "vi"),
            ("tuberkulosis", "tl"), ("tisis", "tl"), ("sakit sa baga", "tl"),
            ("တီဘီ", "my"), ("တီဘီရောဂါ", "my"), ("အဆုတ်တီဘီ", "my"),
            ("របេង", "km"), ("ជំងឺរបេង", "km"), ("របេងសួត", "km"),
            ("ວັນນະໂຣກ", "lo"), ("ພະຍາດວັນນະໂຣກ", "lo"), ("ທີບີ", "lo"),
            ("tuberkulóze", "tet"), ("moras TBC", "tet"), ("tisis", "tet"),
            ("tuberculose", "pt"), ("tísica", "pt"),
            ("结核病", "zh"), ("肺结核", "zh"), ("痨病", "zh"),
            ("காசநோய்", "ta"), ("டிபி", "ta"),
        ]
    },
    {
        "canonical": "Rift Valley Fever",
        "english": "Rift Valley fever",
        "slug": "RIFT_VALLEY_FEVER",
        "category": "Viral / Zoonotic",
        "zoonotic": True,
        "desc": "Viral zoonosis affecting domestic animals and humans via mosquitoes.",
        "aliases": [
            ("Rift Valley Fever", "en"), ("Rift Valley fever virus", "en"), ("RVF", "en"),
            ("Demam Lembah Rift", "id"), ("Rift Valley Fever", "id"), ("RVF", "id"),
            ("Demam Lembah Rift", "ms"), ("Demam Rift Valley", "ms"),
            ("ไข้ริฟต์แวลลีย์", "th"), ("โรคไข้ริฟต์แวลลีย์", "th"),
            ("sốt thung lũng Rift", "vi"), ("bệnh sốt thung lũng Rift", "vi"),
            ("Rift Valley fever", "tl"),
            ("ရစ်ဖ်တောင်ကြားဖျားနာ", "my"),
            ("គ្រុនរីហ្វវ៉ាលី", "km"),
            ("ໄຂ້ຮິບວາເລ", "lo"),
            ("febre do Vale do Rift", "pt"), ("Rift Valley fever", "tet"),
            ("裂谷热", "zh"), ("裂谷热病毒", "zh"),
            ("ரிப்ட் பள்ளத்தாக்கு காய்ச்சல்", "ta"),
        ]
    },
    {
        "canonical": "Rabies",
        "english": "Rabies",
        "slug": "RABIES",
        "category": "Viral / Zoonotic",
        "zoonotic": True,
        "desc": "Preventable viral disease transmitted through the bite of a rabid animal.",
        "aliases": [
            ("Rabies", "en"), ("hydrophobia", "en"), ("rabies virus", "en"),
            ("Rabies", "id"), ("Anjing gila", "id"), ("Penyakit anjing gila", "id"),
            ("Rabies", "ms"), ("Penyakit anjing gila", "ms"),
            ("โรคพิษสุนัขบ้า", "th"), ("โรคกลัวน้ำ", "th"), ("พิษสุนัขบ้า", "th"),
            ("bệnh dại", "vi"), ("dại", "vi"), ("vi rút dại", "vi"),
            ("rabies", "tl"), ("rabis", "tl"),
            ("ခွေးရူးရောဂါ", "my"), ("ခွေးရူးပြန်ရောဂါ", "my"), ("ခွေးရူး", "my"),
            ("ជំងឺឆ្កែឆ្កួត", "km"), ("ឆ្កែឆ្កួត", "km"),
            ("ພະຍາດວໍ້", "lo"), ("ພະຍາດໝາບ້າ", "lo"), ("ໝາບ້າ", "lo"),
            ("moras rabies", "tet"), ("asu bulak", "tet"), ("rabies", "tet"),
            ("raiva", "pt"), ("hidrofobia", "pt"),
            ("狂犬病", "zh"), ("疯狗症", "zh"),
            ("வெறிநாய் கடி", "ta"), ("ரேபிஸ்", "ta"),
        ]
    },
    {
        "canonical": "Polio (Paralysis)",
        "english": "Poliomyelitis",
        "slug": "POLIO",
        "category": "Viral / Enteric",
        "zoonotic": False,
        "desc": "Poliomyelitis causing acute flaccid paralysis transmitted person-to-person.",
        "aliases": [
            ("Polio (Paralysis)", "en"), ("Polio", "en"), ("Poliomyelitis", "en"), ("Infantile paralysis", "en"), ("Acute flaccid paralysis", "en"), ("AFP", "en"),
            ("Polio", "id"), ("Poliomielitis", "id"), ("Kelumpuhan layu akut", "id"), ("Lumpuh layu", "id"),
            ("Polio", "ms"), ("Poliomielitis", "ms"), ("Lumpuh kanak-kanak", "ms"),
            ("โปลิโอ", "th"), ("โรคโปลิโอ", "th"), ("อัมพาตโปลิโอ", "th"),
            ("bại liệt", "vi"), ("bệnh bại liệt", "vi"), ("liệt mềm cấp", "vi"),
            ("polio", "tl"), ("paralisis", "tl"), ("poliyomiyelitis", "tl"),
            ("ပိုလီယို", "my"), ("ပိုလီယိုရောဂါ", "my"), ("ကလေးသူငယ်အကြောသေရောဂါ", "my"),
            ("ស្វិតដៃជើង", "km"), ("ជំងឺស្វិតដៃជើង", "km"), ("ប៉ូលីយ៉ូ", "km"),
            ("ໂປລີໂອ", "lo"), ("ພະຍາດໂປລີໂອ", "lo"),
            ("polio", "tet"), ("moras polio", "tet"), ("paralizia", "tet"),
            ("poliomielite", "pt"), ("paralisia infantil", "pt"),
            ("脊髓灰质炎", "zh"), ("小儿麻痹症", "zh"), ("小儿麻痹", "zh"),
            ("இளம்பிள்ளை வாதம்", "ta"), ("போலியோ", "ta"),
        ]
    },
    {
        "canonical": "Pertussis (Whooping Cough)",
        "english": "Pertussis",
        "slug": "PERTUSSIS",
        "category": "Bacterial / Respiratory",
        "zoonotic": False,
        "desc": "Highly contagious respiratory tract infection caused by Bordetella pertussis.",
        "aliases": [
            ("Pertussis (Whooping Cough)", "en"), ("Pertussis", "en"), ("Whooping cough", "en"), ("100-day cough", "en"),
            ("Pertusis", "id"), ("Batuk rejan", "id"), ("Batuk seratus hari", "id"), ("Batuk 100 hari", "id"),
            ("Batuk kokol", "ms"), ("Pertussis", "ms"),
            ("โรคไอกรน", "th"), ("ไอกรน", "th"),
            ("ho gà", "vi"), ("bệnh ho gà", "vi"),
            ("tusperina", "tl"), ("dalahit na ubo", "tl"), ("whooping cough", "tl"),
            ("ကြက်ညှာ", "my"), ("ကြက်ညှာချောင်းဆိုး", "my"), ("ကြက်ညှာချောင်းဆိုးရောဂါ", "my"),
            ("ក្អកមាន់", "km"), ("ជំងឺក្អកមាន់", "km"),
            ("ໄອໄກ່", "lo"), ("ພະຍາດໄອໄກ່", "lo"),
            ("tos ferina", "tet"), ("moras mear", "tet"),
            ("tosse convulsa", "pt"), ("coqueluche", "pt"),
            ("百日咳", "zh"),
            ("கக்குவான் இருமல்", "ta"), ("பெர்டுசிஸ்", "ta"),
        ]
    },
    {
        "canonical": "Nipah",
        "english": "Nipah virus disease",
        "slug": "NIPAH",
        "category": "Viral / Zoonotic",
        "zoonotic": True,
        "desc": "Zoonotic virus causing severe encephalitis and respiratory illness.",
        "aliases": [
            ("Nipah", "en"), ("Nipah virus", "en"), ("Nipah virus disease", "en"), ("NiV", "en"),
            ("Nipah", "id"), ("Virus Nipah", "id"), ("Penyakit virus Nipah", "id"),
            ("Nipah", "ms"), ("Virus Nipah", "ms"), ("Wabak Nipah", "ms"),
            ("นิปาห์", "th"), ("ไวรัสนิปาห์", "th"), ("โรคนิปาห์", "th"),
            ("Nipah", "vi"), ("virus Nipah", "vi"), ("vi rút Nipah", "vi"),
            ("Nipah", "tl"), ("virus na Nipah", "tl"),
            ("နီပါ", "my"), ("နီပါဗိုင်းရပ်စ်", "my"),
            ("នីប៉ា", "km"), ("វីរុសនីប៉ា", "km"),
            ("ນິປາ", "lo"), ("ໄວຣັສນິປາ", "lo"),
            ("Nipah", "tet"), ("virus Nipah", "tet"),
            ("Nipah", "pt"), ("vírus Nipah", "pt"),
            ("尼帕病毒", "zh"), ("立百病毒", "zh"),
            ("நிபா", "ta"), ("நிபா வைரஸ்", "ta"),
        ]
    },
    {
        "canonical": "Mpox (Monkeypox)",
        "english": "Mpox",
        "slug": "MPOX",
        "category": "Viral / Zoonotic",
        "zoonotic": True,
        "desc": "Zoonotic orthopoxvirus causing fever, rash, and lesions.",
        "aliases": [
            ("Mpox (Monkeypox)", "en"), ("Mpox", "en"), ("Monkeypox", "en"), ("Monkey pox", "en"),
            ("Cacar monyet", "id"), ("Mpox", "id"), ("Monkeypox", "id"),
            ("Cacar monyet", "ms"), ("Mpox", "ms"),
            ("ฝีดาษลิง", "th"), ("ฝีดาษวานร", "th"), ("เอ็มพ็อกซ์", "th"), ("เอ็มพอกซ์", "th"),
            ("đậu mùa khỉ", "vi"), ("bệnh đậu mùa khỉ", "vi"), ("mpox", "vi"),
            ("bulutong-unggoy", "tl"), ("mpox", "tl"), ("monkeypox", "tl"),
            ("မျောက်ကျောက်", "my"), ("မျောက်ကျောက်ရောဂါ", "my"), ("အမ်ပေါက်စ်", "my"),
            ("អុតស្វា", "km"), ("ជំងឺអុតស្វា", "km"), ("អឹមផក", "km"),
            ("ໝາກໝອກລີງ", "lo"), ("ໄຂ້ໝາກໝອກລີງ", "lo"), ("ເອັມພັອກ", "lo"),
            ("cacar makaku", "tet"), ("mpox", "tet"),
            ("varíola dos macacos", "pt"), ("mpox", "pt"),
            ("猴痘", "zh"), ("猴痘病毒", "zh"),
            ("குரங்கம்மை", "ta"), ("எம்பாக்ஸ்", "ta"),
        ]
    },
    {
        "canonical": "MERS",
        "english": "Middle East respiratory syndrome",
        "slug": "MERS",
        "category": "Viral / Respiratory",
        "zoonotic": True,
        "desc": "Middle East Respiratory Syndrome caused by MERS-CoV coronavirus.",
        "aliases": [
            ("MERS", "en"), ("MERS-CoV", "en"), ("Middle East Respiratory Syndrome", "en"),
            ("MERS", "id"), ("MERS-CoV", "id"), ("Sindrom Pernapasan Timur Tengah", "id"),
            ("MERS", "ms"), ("MERS-CoV", "ms"), ("Sindrom Pernafasan Timur Tengah", "ms"),
            ("เมอร์ส", "th"), ("โรคเมอร์ส", "th"), ("โรคทางเดินหายใจตะวันออกกลาง", "th"),
            ("MERS", "vi"), ("MERS-CoV", "vi"), ("hội chứng hô hấp Trung Đông", "vi"),
            ("MERS", "tl"), ("MERS-CoV", "tl"),
            ("မားစ်", "my"), ("မားစ်ရောဂါ", "my"),
            ("មជ្ឈិមបូព៌ា", "km"), ("ជំងឺផ្លូវដង្ហើមមជ្ឈិមបូព៌ា", "km"),
            ("ເມິສ", "lo"), ("ພະຍາດເມິສ", "lo"),
            ("MERS", "tet"), ("sindroma MERS", "tet"),
            ("MERS", "pt"), ("Síndrome Respiratória do Médio Oriente", "pt"),
            ("中东呼吸综合征", "zh"), ("中东呼吸道症候群", "zh"),
            ("மெர்ஸ்", "ta"), ("மெர்ஸ் காய்ச்சல்", "ta"),
        ]
    },
    {
        "canonical": "Melioidosis",
        "english": "Melioidosis",
        "slug": "MELIOIDOSIS",
        "category": "Bacterial / Environmental",
        "zoonotic": True,
        "desc": "Infectious disease caused by Burkholderia pseudomallei in soil and water.",
        "aliases": [
            ("Melioidosis", "en"), ("Whitmore disease", "en"), ("Burkholderia pseudomallei", "en"),
            ("Melioidosis", "id"), ("Penyakit Whitmore", "id"),
            ("Melioidosis", "ms"), ("Penyakit Whitmore", "ms"),
            ("โรคเมลิออยด์", "th"), ("เมลิออยโดสิส", "th"), ("โรคไข้ดิน", "th"),
            ("melioidosis", "vi"), ("bệnh Whitmore", "vi"), ("vi khuẩn whitmore", "vi"),
            ("melioidosis", "tl"),
            ("မယ်လီအွိုက်ဒိုးဆစ်", "my"), ("မြေဆီလွှာဘက်တီးရီးယား", "my"),
            ("មេលីអូអ៊ីដូស", "km"), ("ជំងឺមេលីអូអ៊ីដូស", "km"),
            ("ເມລິອອຍ", "lo"), ("ພະຍາດເມລິອອຍ", "lo"),
            ("melioidose", "tet"),
            ("melioidose", "pt"), ("doença de Whitmore", "pt"),
            ("类鼻疽", "zh"), ("类鼻疽杆菌", "zh"),
            ("மெலியோய்டோசிஸ்", "ta"),
        ]
    },
    {
        "canonical": "Measles",
        "english": "Measles",
        "slug": "MEASLES",
        "category": "Viral / Airborne",
        "zoonotic": False,
        "desc": "Highly contagious viral disease marked by fever and rash.",
        "aliases": [
            ("Measles", "en"), ("Rubeola", "en"), ("Morbilli", "en"),
            ("Campak", "id"), ("Morbili", "id"), ("Gabagen", "id"),
            ("Campak", "ms"), ("Demam campak", "ms"),
            ("โรคหัด", "th"), ("ไข้หัด", "th"), ("หัด", "th"),
            ("bệnh sởi", "vi"), ("sởi", "vi"),
            ("tigdas", "tl"),
            ("ဝက်သက်", "my"), ("ဝက်သက်ရောဂါ", "my"),
            ("កញ្ជ្រឹល", "km"), ("ជំងឺកញ្ជ្រឹល", "km"),
            ("ໝາກແດງ", "lo"), ("ພະຍາດໝາກແດງ", "lo"),
            ("sarampu", "tet"), ("moras sarampu", "tet"),
            ("sarampo", "pt"),
            ("麻疹", "zh"), ("出疹", "zh"),
            ("தட்டம்மை", "ta"), ("மணல்வாரி", "ta"),
        ]
    },
    {
        "canonical": "Marburg",
        "english": "Marburg virus disease",
        "slug": "MARBURG",
        "category": "Viral / Hemorrhagic",
        "zoonotic": True,
        "desc": "Severe hemorrhagic fever caused by Marburg filovirus.",
        "aliases": [
            ("Marburg", "en"), ("Marburg virus", "en"), ("Marburg virus disease", "en"), ("MVD", "en"),
            ("Marburg", "id"), ("Virus Marburg", "id"), ("Demam berdarah Marburg", "id"),
            ("Marburg", "ms"), ("Virus Marburg", "ms"),
            ("มาร์บวร์ก", "th"), ("ไวรัสมาร์บวร์ก", "th"), ("ไข้มาร์บวร์ก", "th"),
            ("Marburg", "vi"), ("vi rút Marburg", "vi"), ("bệnh sốt Marburg", "vi"),
            ("Marburg", "tl"), ("virus na Marburg", "tl"),
            ("မာဘတ်", "my"), ("မာဘတ်ဗိုင်းရပ်စ်", "my"),
            ("ម៉ាប៊ើក", "km"), ("វីរុសម៉ាប៊ើក", "km"),
            ("ມາເບີກ", "lo"), ("ໄວຣັສມາເບີກ", "lo"),
            ("Marburg", "tet"), ("virus Marburg", "tet"),
            ("Marburgo", "pt"), ("vírus de Marburgo", "pt"),
            ("马尔堡", "zh"), ("马尔堡病毒", "zh"), ("马尔堡出血热", "zh"),
            ("மார்बर्ग", "ta"), ("மார்பர்க் வைரஸ்", "ta"),
        ]
    },
    {
        "canonical": "Malaria",
        "english": "Malaria",
        "slug": "MALARIA",
        "category": "Parasitic / Vector-borne",
        "zoonotic": True,
        "desc": "Life-threatening disease caused by Plasmodium parasites transmitted by Anopheles mosquitoes.",
        "aliases": [
            ("Malaria", "en"), ("Plasmodium", "en"), ("Paludism", "en"),
            ("Malaria", "id"), ("Demam malaria", "id"),
            ("Malaria", "ms"),
            ("มาลาเรีย", "th"), ("ไข้จับสั่น", "th"), ("ไข้ป่า", "th"),
            ("sốt rét", "vi"), ("bệnh sốt rét", "vi"),
            ("malaria", "tl"),
            ("ငှက်ဖျား", "my"), ("ငှက်ဖျားရောဂါ", "my"),
            ("គ្រុនចាញ់", "km"), ("ជំងឺគ្រុនចាញ់", "km"),
            ("ໄຂ້ຍຸງ", "lo"), ("ໄຂ້ມາລາເຣຍ", "lo"), ("ໄຂ້ປ່າ", "lo"),
            ("malária", "tet"), ("moras malaria", "tet"),
            ("malária", "pt"), ("paludismo", "pt"),
            ("疟疾", "zh"), ("打摆子", "zh"),
            ("மலேரியா", "ta"), ("மலேரியா காய்ச்சல்", "ta"),
        ]
    },
    {
        "canonical": "Lymphatic Filariasis",
        "english": "Lymphatic filariasis",
        "slug": "LYMPHATIC_FILARIASIS",
        "category": "Parasitic / Vector-borne",
        "zoonotic": False,
        "desc": "Parasitic infection causing elephantiasis transmitted by mosquitoes.",
        "aliases": [
            ("Lymphatic Filariasis", "en"), ("Filariasis", "en"), ("Elephantiasis", "en"),
            ("Filariasis", "id"), ("Kaki gajah", "id"), ("Penyakit kaki gajah", "id"),
            ("Untut", "ms"), ("Penyakit untut", "ms"), ("Filariasis", "ms"),
            ("โรคเท้าช้าง", "th"), ("เท้าช้าง", "th"),
            ("phù voi", "vi"), ("bệnh phù voi", "vi"), ("giun chỉ bạch huyết", "vi"),
            ("filariasis", "tl"), ("elepantiasis", "tl"),
            ("ဆင်ခြေထောက်ရောဂါ", "my"), ("ဆင်ခြေထောက်", "my"),
            ("ជើងដំរី", "km"), ("ជំងឺជើងដំរី", "km"),
            ("ພະຍາດຕີນຊ້າງ", "lo"), ("ຕີນຊ້າງ", "lo"),
            ("elefantíase", "tet"), ("moras ain boot", "tet"),
            ("filariose linfática", "pt"), ("elefantíase", "pt"),
            ("丝虫病", "zh"), ("淋巴丝虫病", "zh"), ("象皮病", "zh"),
            ("யானைக்கால் நோய்", "ta"), ("பைலேரியாசிஸ்", "ta"),
        ]
    },
    {
        "canonical": "Leptospirosis",
        "english": "Leptospirosis",
        "slug": "LEPTOSPIROSIS",
        "category": "Bacterial / Zoonotic",
        "zoonotic": True,
        "desc": "Bacterial disease spread through contact with water or soil contaminated by animal urine.",
        "aliases": [
            ("Leptospirosis", "en"), ("Weil disease", "en"), ("rat fever", "en"),
            ("Leptospirosis", "id"), ("Kencing tikus", "id"), ("Demam kencing tikus", "id"),
            ("Kencing tikus", "ms"), ("Penyakit kencing tikus", "ms"), ("Leptospirosis", "ms"),
            ("โรคฉี่หนู", "th"), ("ฉี่หนู", "th"), ("เลปโตสไปโรซิส", "th"),
            ("leptospira", "vi"), ("bệnh xoắn khuẩn vàng da", "vi"), ("sốt xoắn khuẩn", "vi"),
            ("leptospirosis", "tl"), ("ihi ng daga", "tl"),
            ("ကြွက်ဆီးရောဂါ", "my"), ("လက်ပတိုစပိုင်ရိုဆစ်", "my"),
            ("ឡិបតូស្ពីរ៉ូស", "km"), ("ជំងឺឡិបតូស្ពីរ៉ូស", "km"),
            ("ພະຍາດຍ່ຽວໜູ", "lo"), ("ຍ່ຽວໜູ", "lo"),
            ("leptospirose", "tet"), ("moras lixu-lao", "tet"),
            ("leptospirose", "pt"), ("doença de Weil", "pt"),
            ("钩端螺旋体病", "zh"), ("钩体病", "zh"),
            ("எலி காய்ச்சல்", "ta"), ("லெப்டோஸ்பிரோசிஸ்", "ta"),
        ]
    },
    {
        "canonical": "Lassa fever",
        "english": "Lassa fever",
        "slug": "LASSA_FEVER",
        "category": "Viral / Hemorrhagic",
        "zoonotic": True,
        "desc": "Acute viral hemorrhagic illness caused by Lassa virus.",
        "aliases": [
            ("Lassa fever", "en"), ("Lassa virus", "en"), ("LASSA_FEVER", "en"),
            ("Demam Lassa", "id"), ("Lassa", "id"), ("Virus Lassa", "id"),
            ("Demam Lassa", "ms"), ("Lassa", "ms"),
            ("ไข้ลัสซา", "th"), ("โรคไข้ลัสซา", "th"),
            ("sốt Lassa", "vi"), ("virus Lassa", "vi"),
            ("Lassa fever", "tl"),
            ("လာဆာဖျားနာ", "my"), ("လာဆာဗိုင်းရပ်စ်", "my"),
            ("គ្រុនឡាសា", "km"),
            ("ໄຂ້ລັດຊາ", "lo"),
            ("febre de Lassa", "pt"), ("Lassa", "tet"),
            ("拉沙热", "zh"), ("拉沙病毒", "zh"),
            ("லாசா காய்ச்சல்", "ta"),
        ]
    },
    {
        "canonical": "HIV/AIDS",
        "english": "HIV disease",
        "slug": "HIV_AIDS",
        "category": "Viral / Immunodeficiency",
        "zoonotic": False,
        "desc": "Human immunodeficiency virus infection and acquired immunodeficiency syndrome.",
        "aliases": [
            ("HIV/AIDS", "en"), ("HIV", "en"), ("AIDS", "en"),
            ("HIV/AIDS", "id"), ("HIV", "id"), ("AIDS", "id"), ("Odha", "id"),
            ("HIV/AIDS", "ms"), ("HIV", "ms"), ("AIDS", "ms"),
            ("เอชไอวี", "th"), ("โรคเอดส์", "th"), ("เอดส์", "th"),
            ("HIV/AIDS", "vi"), ("nhiễm HIV", "vi"), ("bệnh AIDS", "vi"),
            ("HIV/AIDS", "tl"), ("HIV", "tl"), ("AIDS", "tl"),
            ("အိတ်ခ်ျအိုင်ဗွီ", "my"), ("အေအိုင်ဒီအက်စ်", "my"), ("အေဒီအက်စ်", "my"),
            ("មេរោគអេដស៍", "km"), ("ជំងឺអេដស៍", "km"), ("អេដស៍", "km"),
            ("ເອດສ໌", "lo"), ("ພະຍາດເອດສ໌", "lo"), ("ເອສໄອວີ", "lo"),
            ("HIV/SIDA", "tet"), ("moras SIDA", "tet"), ("HIV", "tet"),
            ("VIH/SIDA", "pt"), ("SIDA", "pt"), ("HIV", "pt"),
            ("艾滋病", "zh"), ("艾滋", "zh"), ("爱滋病", "zh"), ("HIV", "zh"),
            ("எச்.ஐ.வி", "ta"), ("எய்ட்ஸ்", "ta"),
        ]
    },
    {
        "canonical": "Henipaviral disease",
        "english": "Henipavirus infection",
        "slug": "HENIPAVIRAL",
        "category": "Viral / Zoonotic",
        "zoonotic": True,
        "desc": "Emerging zoonotic disease caused by Henipaviruses (Hendra, Nipah, Langya).",
        "aliases": [
            ("Henipaviral disease", "en"), ("Henipavirus", "en"), ("Hendra virus", "en"), ("Langya virus", "en"),
            ("Henipavirus", "id"), ("Penyakit Henipavirus", "id"), ("Virus Hendra", "id"),
            ("Henipavirus", "ms"), ("Virus Hendra", "ms"),
            ("โรคเฮนิปาไวรัส", "th"), ("เฮนิปาไวรัส", "th"),
            ("henipavirus", "vi"), ("bệnh do virus henipavirus", "vi"),
            ("henipavirus", "tl"),
            ("ဟနီပါဗိုင်းရပ်စ်", "my"),
            ("វីរុសហេនីប៉ា", "km"), ("ជំងឺវីរុសហេនីប៉ា", "km"),
            ("ພະຍາດເຮນິພາໄວຣັສ", "lo"),
            ("henipavírus", "pt"), ("Henipavirus", "tet"),
            ("亨尼帕病毒", "zh"), ("琅琊病毒", "zh"),
            ("ஹெனிபாவைரஸ்", "ta"),
        ]
    },
    {
        "canonical": "Hantavirus",
        "english": "Hantavirus disease",
        "slug": "HANTAVIRUS",
        "category": "Viral / Zoonotic",
        "zoonotic": True,
        "desc": "Virus transmitted by rodents causing hemorrhagic fever with renal syndrome or HPS.",
        "aliases": [
            ("Hantavirus", "en"), ("Hantavirus pulmonary syndrome", "en"), ("HPS", "en"), ("HFRS", "en"),
            ("Hantavirus", "id"), ("Demam berdarah sindrom ginjal", "id"),
            ("Hantavirus", "ms"),
            ("ฮันตาไวรัส", "th"), ("ไวรัสฮันตา", "th"), ("โรคฮันตาไวรัส", "th"),
            ("hantavirus", "vi"), ("hội chứng phổi hantavirus", "vi"),
            ("hantavirus", "tl"),
            ("ဟန်တာဗိုင်းရပ်စ်", "my"),
            ("វីរុសហាន់តា", "km"),
            ("ໄວຣັສຮານຕາ", "lo"),
            ("hantavírus", "pt"), ("Hantavirus", "tet"),
            ("汉坦病毒", "zh"), ("汉他病毒", "zh"),
            ("ஹந்தாவைரஸ்", "ta"),
        ]
    },
    {
        "canonical": "Hand, Foot, and Mouth Disease (HFMD)",
        "english": "Hand, foot and mouth disease",
        "slug": "HFMD",
        "category": "Viral / Enteric",
        "zoonotic": False,
        "desc": "Common contagious childhood illness caused by enteroviruses (EV-A71, Coxsackie).",
        "aliases": [
            ("Hand, Foot, and Mouth Disease (HFMD)", "en"), ("Hand, Foot, and Mouth Disease", "en"), ("HFMD", "en"), ("Hand foot mouth disease", "en"),
            ("Flu Singapura", "id"), ("Penyakit tangan kaki dan mulut", "id"), ("PTKM", "id"), ("HFMD", "id"),
            ("Penyakit tangan, kaki dan mulut", "ms"), ("HFMD", "ms"),
            ("โรคมือเท้าปาก", "th"), ("มือเท้าปาก", "th"), ("โรคเอชเอฟเอ็มดี", "th"),
            ("tay chân miệng", "vi"), ("bệnh tay chân miệng", "vi"), ("TCM", "vi"), ("hfmd", "vi"),
            ("sakit sa kamay, paa, at bibig", "tl"), ("HFMD", "tl"),
            ("လက်၊ ခြေ၊ ခံတွင်းရောဂါ", "my"), ("လက်ခြေခံတွင်း", "my"), ("HFMD", "my"),
            ("ជំងឺពងបែកដៃជើងនិងក្នុងមាត់", "km"), ("ជំងឺដៃជើងមាត់", "km"), ("HFMD", "km"),
            ("ພະຍາດມືຕີນປາກ", "lo"), ("ມືຕີນປາກ", "lo"), ("HFMD", "lo"),
            ("moras liman ain no ibun", "tet"), ("HFMD", "tet"),
            ("doença mão-pé-boca", "pt"), ("HFMD", "pt"),
            ("手足口病", "zh"), ("手足口症", "zh"), ("肠病毒71型", "zh"),
            ("கை, கால் மற்றும் வாய் நோய்", "ta"), ("எச்.எஃப்.எம்.டி", "ta"),
        ]
    },
    {
        "canonical": "Ebola",
        "english": "Ebola disease",
        "slug": "EBOLA",
        "category": "Viral / Hemorrhagic",
        "zoonotic": True,
        "desc": "Severe, often fatal viral hemorrhagic disease caused by Ebola virus.",
        "aliases": [
            ("Ebola", "en"), ("Ebola virus", "en"), ("Ebola disease", "en"), ("Ebola virus disease", "en"), ("EVD", "en"),
            ("Ebola", "id"), ("Virus Ebola", "id"), ("Penyakit virus Ebola", "id"),
            ("Ebola", "ms"), ("Virus Ebola", "ms"),
            ("อีโบลา", "th"), ("โรคไวรัสอีโบลา", "th"), ("ไวรัสอีโบลา", "th"),
            ("Ebola", "vi"), ("bệnh Ebola", "vi"), ("sốt xuất huyết Ebola", "vi"),
            ("Ebola", "tl"), ("virus na Ebola", "tl"),
            ("အီဘိုလာ", "my"), ("အီဘိုလာဗိုင်းရပ်စ်", "my"),
            ("អេបូឡា", "km"), ("ជំងឺអេបូឡា", "km"),
            ("ອີໂບລາ", "lo"), ("ພະຍາດອີໂບລາ", "lo"),
            ("moras Ebola", "tet"), ("virus Ebola", "tet"),
            ("Ébola", "pt"), ("vírus do Ébola", "pt"), ("doença do vírus Ébola", "pt"),
            ("埃博拉", "zh"), ("伊波拉", "zh"), ("埃博拉病毒", "zh"),
            ("எபோலா", "ta"), ("எபோலா வைரஸ்", "ta"),
        ]
    },
    {
        "canonical": "Diphtheria",
        "english": "Diphtheria",
        "slug": "DIPHTHERIA",
        "category": "Bacterial / Respiratory",
        "zoonotic": False,
        "desc": "Serious infection caused by strains of Corynebacterium diphtheriae making toxin.",
        "aliases": [
            ("Diphtheria", "en"), ("Corynebacterium diphtheriae", "en"),
            ("Difteri", "id"), ("Difteria", "id"),
            ("Diffteria", "ms"), ("Difteri", "ms"),
            ("โรคคอตีบ", "th"), ("คอตีบ", "th"),
            ("bạch hầu", "vi"), ("bệnh bạch hầu", "vi"),
            ("dipterya", "tl"),
            ("ဆုံဆို့နာ", "my"), ("ဆုံဆို့နာရောဂါ", "my"),
            ("ខាន់ស្លាក់", "km"), ("ជំងឺខាន់ស្លាក់", "km"),
            ("ພະຍາດຄໍຕີບ", "lo"), ("ຄໍຕີບ", "lo"),
            ("difteria", "tet"), ("moras kakorok metin", "tet"),
            ("difteria", "pt"),
            ("白喉", "zh"), ("白喉杆菌", "zh"),
            ("தொண்டை அடைப்பான்", "ta"), ("டிப்தீரியா", "ta"),
        ]
    },
    {
        "canonical": "Dengue",
        "english": "Dengue",
        "slug": "DENGUE",
        "category": "Viral / Mosquito-borne",
        "zoonotic": False,
        "desc": "Mosquito-borne viral infection widespread throughout ASEAN tropical regions.",
        "aliases": [
            ("Dengue", "en"), ("Dengue fever", "en"), ("Dengue virus", "en"), ("Breakbone fever", "en"), ("DHF", "en"), ("DSS", "en"),
            ("DBD", "id"), ("Demam berdarah", "id"), ("Demam berdarah dengue", "id"), ("Infeksi dengue", "id"), ("Dengue", "id"),
            ("Demam denggi", "ms"), ("Denggi", "ms"), ("Wabak denggi", "ms"),
            ("ไข้เลือดออก", "th"), ("โรคไข้เลือดออก", "th"), ("เดงกี", "th"), ("ไข้เดงกี", "th"),
            ("sốt xuất huyết", "vi"), ("sot xuat huyet", "vi"), ("sốt xuất huyết dengue", "vi"), ("bệnh sốt xuất huyết", "vi"),
            ("dengue", "tl"), ("trangkaso ng dengue", "tl"), ("lagnat ng dengue", "tl"),
            ("သွေးလွန်တုပ်ကွေး", "my"), ("သွေးလွန်တုပ်ကွေးရောဂါ", "my"), ("ဒင်းဂီး", "my"),
            ("គ្រុនឈាម", "km"), ("ជំងឺគ្រុនឈាម", "km"), ("គ្រុនឈាមដេងហ្គី", "km"),
            ("ໄຂ້ເລືອດອອກ", "lo"), ("ພະຍາດໄຂ້ເລືອດອອກ", "lo"), ("ໄຂ້ເດັງກີ", "lo"),
            ("dengue", "tet"), ("moras dengue", "tet"), ("isin manas dengue", "tet"),
            ("dengue", "pt"), ("febre de dengue", "pt"),
            ("登革热", "zh"), ("登革病毒", "zh"), ("骨痛热症", "zh"),
            ("டெங்கு", "ta"), ("டெங்கு காய்ச்சல்", "ta"),
        ]
    },
    {
        "canonical": "Crimean-Congo Hemorrhagic Fever",
        "english": "Crimean-Congo hemorrhagic fever",
        "slug": "CRIMEAN_CONGO_HF",
        "category": "Viral / Hemorrhagic",
        "zoonotic": True,
        "desc": "Tick-borne viral disease causing severe hemorrhagic fever outbreaks.",
        "aliases": [
            ("Crimean-Congo Hemorrhagic Fever", "en"), ("CCHF", "en"), ("Crimean-Congo fever", "en"),
            ("Demam Berdarah Krimea-Kongo", "id"), ("Demam Krimea-Kongo", "id"), ("CCHF", "id"),
            ("Demam Berdarah Crimean-Congo", "ms"), ("Demam Crimean-Congo", "ms"),
            ("ไข้เลือดออกไครเมียนคองโก", "th"), ("โรคไข้เลือดออกไครเมีย-คองโก", "th"),
            ("sốt xuất huyết Crimean-Congo", "vi"), ("bệnh sốt Crimean-Congo", "vi"),
            ("Crimean-Congo hemorrhagic fever", "tl"),
            ("ခရိုင်းမီးယား-ကွန်ဂို သွေးလွန်တုပ်ကွေး", "my"),
            ("គ្រុនឈាមគ្រីមៀកុងហ្គោ", "km"),
            ("ໄຂ້ເລືອດອອກຄຣີເມຍຄອງໂກ", "lo"),
            ("febre hemorrágica da Crimeia-Congo", "pt"), ("CCHF", "tet"),
            ("克里米亚-刚果出血热", "zh"), ("新疆出血热", "zh"),
            ("கிரிமியன்-காங்கோ ரத்தக்கசிவு காய்ச்சல்", "ta"),
        ]
    },
    {
        "canonical": "COVID-19",
        "english": "Coronavirus disease 2019",
        "slug": "COVID19",
        "category": "Viral / Respiratory",
        "zoonotic": True,
        "desc": "Infectious respiratory disease caused by SARS-CoV-2 coronavirus.",
        "aliases": [
            ("COVID-19", "en"), ("COVID19", "en"), ("Coronavirus", "en"), ("SARS-CoV-2", "en"), ("2019-nCoV", "en"),
            ("COVID-19", "id"), ("Korona", "id"), ("Corona", "id"), ("Virus korona", "id"),
            ("COVID-19", "ms"), ("Koronavirus", "ms"), ("Wabak COVID-19", "ms"),
            ("โควิด-19", "th"), ("โควิด", "th"), ("ไวรัสโคโรนา", "th"),
            ("COVID-19", "vi"), ("covid", "vi"), ("vi rút SARS-CoV-2", "vi"),
            ("COVID-19", "tl"), ("koronabirus", "tl"),
            ("ကိုဗစ်-၁၉", "my"), ("ကိုဗစ်", "my"), ("ကိုရိုနာဗိုင်းရပ်စ်", "my"),
            ("កូវីដ-១៩", "km"), ("កូវីដ", "km"), ("កូរ៉ូណាវីរុស", "km"),
            ("ໂຄວິດ-19", "lo"), ("ໂຄວິດ", "lo"), ("ໄວຣັສໂຄໂຣນາ", "lo"),
            ("COVID-19", "tet"), ("moras koronavírus", "tet"),
            ("COVID-19", "pt"), ("coronavírus", "pt"),
            ("新冠肺炎", "zh"), ("新型冠状病毒", "zh"), ("新冠", "zh"), ("冠状病毒", "zh"),
            ("கோவிட்-19", "ta"), ("கொரோனா", "ta"), ("கொரோனா வைரஸ்", "ta"),
        ]
    },
    {
        "canonical": "Chikungunya",
        "english": "Chikungunya disease",
        "slug": "CHIKUNGUNYA",
        "category": "Viral / Mosquito-borne",
        "zoonotic": False,
        "desc": "Viral disease transmitted by mosquitoes causing fever and debilitating joint pain.",
        "aliases": [
            ("Chikungunya", "en"), ("Chikungunya fever", "en"), ("CHIKV", "en"),
            ("Chikungunya", "id"), ("Cikungunya", "id"), ("Flu tulang", "id"),
            ("Chikungunya", "ms"), ("Demam Chikungunya", "ms"),
            ("ชิคุนกุนยา", "th"), ("ไข้ปวดข้อยุงลาย", "th"), ("โรคชิคุนกุนยา", "th"),
            ("chikungunya", "vi"), ("sốt chikungunya", "vi"), ("bệnh chikungunya", "vi"),
            ("chikungunya", "tl"),
            ("ချီကွန်ဂุนယာ", "my"), ("ချီကွန်ဂန်းယား", "my"),
            ("ឈីកគុនហ្គុនយ៉ា", "km"), ("ជំងឺគ្រុនឈីក", "km"),
            ("ຊິຄຸນກຸນຍາ", "lo"), ("ໄຂ້ຊິຄຸນກຸນຍາ", "lo"),
            ("chikungunya", "tet"), ("moras chikungunya", "tet"),
            ("chikungunya", "pt"), ("febre chikungunya", "pt"),
            ("基孔肯雅热", "zh"), ("基孔肯雅", "zh"),
            ("சிக்குன்குனியா", "ta"),
        ]
    },
    {
        "canonical": "Avian Influenza (Bird Flu)",
        "english": "Avian influenza",
        "slug": "AVIAN_INFLUENZA",
        "category": "Viral / Respiratory",
        "zoonotic": True,
        "desc": "Infection caused by avian influenza viruses (H5N1, H7N9) adapted to birds.",
        "aliases": [
            ("Avian Influenza (Bird Flu)", "en"), ("Avian Influenza", "en"), ("Bird flu", "en"), ("Avian flu", "en"), ("H5N1", "en"), ("H7N9", "en"), ("H5N6", "en"),
            ("Flu Burung", "id"), ("Avian Influenza", "id"), ("Virus H5N1", "id"),
            ("Selsema burung", "ms"), ("Flu burung", "ms"), ("Avian influenza", "ms"),
            ("ไข้หวัดนก", "th"), ("โรคไข้หวัดนก", "th"), ("ไวรัสหวัดนก", "th"), ("เอช5เอ็น1", "th"),
            ("cúm gia cầm", "vi"), ("cúm A/H5N1", "vi"), ("cúm h5n1", "vi"), ("bệnh cúm gia cầm", "vi"),
            ("trangkaso ng ibon", "tl"), ("bird flu", "tl"), ("avian flu", "tl"),
            ("ကြက်ငှက်တုပ်ကွေး", "my"), ("ကြက်ငှက်တုပ်ကွေးရောဂါ", "my"),
            ("ផ្តាសាយបក្សី", "km"), ("ជំងឺផ្តាសាយបក្សី", "km"),
            ("ໄຂ້ຫວັດສັດປີກ", "lo"), ("ໄຂ້ຫວັດນົກ", "lo"),
            ("gripu manu", "tet"), ("moras gripu manu", "tet"),
            ("gripe aviária", "pt"), ("gripe das aves", "pt"),
            ("禽流感", "zh"), ("鸟流感", "zh"), ("H5N1禽流感", "zh"),
            ("பறவை காய்ச்சல்", "ta"), ("ஏவியன் காய்ச்சல்", "ta"),
        ]
    },
    {
        "canonical": "Anthrax",
        "english": "Anthrax",
        "slug": "ANTHRAX",
        "category": "Bacterial / Zoonotic",
        "zoonotic": True,
        "desc": "Serious infectious disease caused by Bacillus anthracis bacteria.",
        "aliases": [
            ("Anthrax", "en"), ("Bacillus anthracis", "en"), ("Woolsorter disease", "en"),
            ("Antraks", "id"), ("Radang limpa", "id"), ("Bacillus anthracis", "id"),
            ("Antraks", "ms"),
            ("แอนแทรกซ์", "th"), ("โรคแอนแทรกซ์", "th"),
            ("bệnh than", "vi"), ("bệnh nhiệt thán", "vi"),
            ("antraks", "tl"),
            ("ဒေါင့်သန်း", "my"), ("ဒေါင့်သန်းရောဂါ", "my"),
            ("អង់ត្រាក់", "km"), ("ជំងឺអង់ត្រាក់", "km"),
            ("ພະຍາດແອນແທຣັກ", "lo"), ("ແອນແທຣັກ", "lo"),
            ("ántrax", "tet"), ("moras antraz", "tet"),
            ("antraz", "pt"), ("carbúnculo", "pt"),
            ("炭疽", "zh"), ("炭疽热", "zh"), ("炭疽杆菌", "zh"),
            ("ஆந்த்ராக்ஸ்", "ta"), ("கரிநோய்", "ta"),
        ]
    },
    {
        "canonical": "Unknown Disease",
        "english": "Unknown or unclassified disease",
        "slug": "UNKNOWN_DISEASE",
        "category": "Unclassified / Outbreak",
        "zoonotic": False,
        "desc": "Unidentified or novel disease outbreak requiring epidemiological investigation.",
        "aliases": [
            ("Unknown Disease", "en"), ("Disease X", "en"), ("Undiagnosed illness", "en"), ("Mystery disease", "en"), ("Unexplained illness", "en"),
            ("Penyakit Tidak Dikenal", "id"), ("Penyakit misterius", "id"), ("Sindrom misterius", "id"), ("Wabah misterius", "id"),
            ("Penyakit misteri", "ms"), ("Penyakit tidak diketahui", "ms"),
            ("โรคไม่ทราบสาเหตุ", "th"), ("โรคปริศนา", "th"), ("โรคระบาดปริศนา", "th"),
            ("bệnh lạ", "vi"), ("bệnh chưa rõ nguyên nhân", "vi"), ("bệnh bí ẩn", "vi"),
            ("misteryosong sakit", "tl"), ("di-kilalang sakit", "tl"),
            ("အမည်မသိရောဂါ", "my"), ("ထူးဆန်းသောရောဂါ", "my"),
            ("ជំងឺចម្លែក", "km"), ("ជំងឺមិនស្គាល់អត្តសញ្ញាណ", "km"),
            ("ພະຍາດແປກປະຫຼາດ", "lo"), ("ພະຍາດບໍ່ຮູ້ສາເຫດ", "lo"),
            ("moras misteriozu", "tet"), ("moras la konhesidu", "tet"),
            ("doença desconhecida", "pt"), ("doença misteriosa", "pt"),
            ("不明疾病", "zh"), ("神秘疾病", "zh"), ("未知疾病", "zh"), ("X疾病", "zh"),
            ("விவரிக்க முடியாத நோய்", "ta"), ("தெரியாத நோய்", "ta"),
        ]
    }
]

def generate_migration_sql():
    sql = []
    sql.append("-- =====================================================================")
    sql.append("-- Migration 120: Master Data Purge & ASEAN 31 Disease Database Injection")
    sql.append("-- Cleans legacy master disease concepts, redirects, and old aliases.")
    sql.append("-- Injects 31 official ASEAN CDC diseases with complete 11 ASEAN country aliases.")
    sql.append("-- Completely decouples dependency on external WHO ICD-11 API.")
    sql.append("-- =====================================================================\n")

    sql.append("BEGIN;\n")

    # Step 1: Clean up
    sql.append("-- 1. Disconnect referencing records and clear old master tables")
    sql.append("DELETE FROM disease_concept_redirects;")
    sql.append("DELETE FROM disease_discovery_candidates;")
    sql.append("DELETE FROM disease_label_migration_conflicts_059;")
    sql.append("UPDATE crawl_matrix_rows SET disease_concept_id = NULL WHERE disease_concept_id IS NOT NULL;")
    sql.append("UPDATE disease_events SET primary_disease_concept_id = NULL WHERE primary_disease_concept_id IS NOT NULL;")
    sql.append("UPDATE disease_event_diseases SET disease_concept_id = NULL WHERE disease_concept_id IS NOT NULL;")
    sql.append("DELETE FROM disease_aliases;")
    sql.append("DELETE FROM disease_concepts;")
    sql.append("DELETE FROM nlp_keywords WHERE category = 'disease';\n")

    # Step 2: Ensure ontology_code unique constraint accommodates NULLs properly
    sql.append("-- 2. Ensure schema allows decoupled ontology codes")
    sql.append("ALTER TABLE disease_concepts ALTER COLUMN ontology_system SET DEFAULT 'ASEAN Master Catalog';")
    sql.append("ALTER TABLE disease_concepts ALTER COLUMN confidence SET DEFAULT 1.0;")
    sql.append("ALTER TABLE disease_concepts ALTER COLUMN is_active SET DEFAULT TRUE;\n")

    # Step 3: Insert 31 concepts
    sql.append("-- 3. Insert official 31 ASEAN diseases")
    for d in DISEASES:
        canon = d["canonical"].replace("'", "''")
        eng = d["english"].replace("'", "''")
        slug = d["slug"].replace("'", "''")
        cat = d["category"].replace("'", "''")
        desc = d["desc"].replace("'", "''")
        zoo = "TRUE" if d["zoonotic"] else "FALSE"

        sql.append(f"""INSERT INTO disease_concepts (
    id, canonical_name, english_name, disease_id, category, is_zoonotic,
    description, ontology_system, ontology_code, ontology_uri, source,
    confidence, is_active, is_public, allow_engine, canonicalization_status
) VALUES (
    gen_random_uuid(), '{canon}', '{eng}', '{slug}', '{cat}', {zoo},
    '{desc}', 'ASEAN Master Catalog', NULL, NULL, 'asean_master_database',
    1.0, TRUE, TRUE, TRUE, 'validated'
);""")

    sql.append("\n-- 4. Insert Comprehensive ASEAN Multilingual Aliases")
    for d in DISEASES:
        canon = d["canonical"].replace("'", "''")
        for alias, lang in d["aliases"]:
            clean_alias = alias.strip().replace("'", "''")
            norm_alias = re.sub(r"\s+", " ", re.sub(r"[^\w\s-]", " ", clean_alias.lower())).strip()
            sql.append(f"""INSERT INTO disease_aliases (concept_id, alias, normalized_alias, language, source, confidence, is_active)
SELECT id, '{clean_alias}', '{norm_alias}', '{lang}', 'asean_master_injection', 1.0, TRUE
FROM disease_concepts WHERE canonical_name = '{canon}'
ON CONFLICT (concept_id, normalized_alias, language) DO NOTHING;""")

    sql.append("\n-- 5. Insert NLP Disease Keywords mapped to canonical labels")
    for d in DISEASES:
        canon = d["canonical"].replace("'", "''")
        seen_kw = set()
        for alias, _ in d["aliases"]:
            kw_clean = alias.strip().replace("'", "''")
            kw_key = kw_clean.lower()
            if kw_key in seen_kw or len(kw_clean) < 2:
                continue
            seen_kw.add(kw_key)
            sql.append(f"""INSERT INTO nlp_keywords (category, keyword, target_label, priority, is_active)
VALUES ('disease', '{kw_clean}', '{canon}', 400, TRUE)
ON CONFLICT (category, keyword) DO UPDATE SET target_label = EXCLUDED.target_label, is_active = TRUE;""")

    sql.append("\n-- 6. Ensure NLP labels contain all 31 canonical disease names")
    for d in DISEASES:
        canon = d["canonical"].replace("'", "''")
        sql.append(f"""INSERT INTO nlp_labels (category, label, is_active, priority)
VALUES ('disease', '{canon}', TRUE, 100)
ON CONFLICT (category, label) DO UPDATE SET is_active = TRUE;""")

    sql.append("\n-- 7. Re-link existing disease events and event diseases where names match")
    sql.append("""
UPDATE disease_events de
SET primary_disease_concept_id = dc.id
FROM disease_concepts dc
WHERE de.disease = dc.canonical_name
   OR lower(de.disease) = lower(dc.canonical_name);

UPDATE disease_event_diseases ded
SET disease_concept_id = dc.id
FROM disease_concepts dc
WHERE ded.disease_name = dc.canonical_name
   OR lower(ded.disease_name) = lower(dc.canonical_name);
""")

    sql.append("COMMIT;\n")
    return "\n".join(sql)

if __name__ == "__main__":
    target = "/home/aspire_5/app/NLP-PENYAKIT/database/init/120_clean_and_inject_asean_master_diseases.sql"
    content = generate_migration_sql()
    with open(target, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Generated {target} with {len(content)} bytes.")
