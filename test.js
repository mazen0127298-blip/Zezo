
// Auto installer for required packages
import { execSync } from "child_process";
import fs from "fs";

function install(pkg) {
  try {
    require.resolve(pkg);
  } catch (e) {
    console.log(`Installing ${pkg}...`);
    execSync(`npm install ${pkg}`, { stdio: "inherit" });
  }
}

["discord.js", "@google/generative-ai"].forEach(install);

import { Client, GatewayIntentBits, REST, Routes, AttachmentBuilder } from "discord.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

// استخدام المتغيرات من الاستضافة
const token = process.env.token;
const API = process.env.Gemini;

if (!token || !API) {
  console.error("❌ لازم تحط متغيرات البيئة token و Gemini في الاستضافة");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const genAI = new GoogleGenerativeAI(API);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

let aiRooms = new Set();

// تدريب البوت
const systemInstruction = `انت بوت ديسكورد مخصص لـ مساعدة الاعضاء (member) في البرمجه و التصاميم و الاسئله العامه
انت مخصص البرمجه لتقديم نصائح ~~ تعديلات ~~ اخطاء للتصاميم
قم بالتدقيق الكامل للصوره ولا تعطي اقل من اربع نصائح او ثلاث اخطاء او اربع تعديلات
لا تقم بقول كلام اكثر من المخصص له ~ لاحظ التصاميم كانك بشري ومصمم دقيق وفنان للغايه`;


async function askGemini(prompt, retries = 2) {
  try {
    const result = await model.generateContent({
      contents: [
        { role: "system", parts: [{ text: systemInstruction }] },
        { role: "user", parts: [{ text: prompt }] }
      ]
    });

    if (!result || !result.response) {
      console.error("⚠️ استجابة فارغة من Gemini:", result);
      return "❌ مفيش رد من Gemini، جرب تاني.";
    }

    return result.response.text();
  } catch (e) {
    console.error("❌ خطأ من Gemini:", e);
    if (retries > 0) {
      console.log("🔄 إعادة المحاولة...");
      return await askGemini(prompt, retries - 1);
    }
    return `❌ حصل خطأ مع Gemini: ${e.message || e}`;
  }
}

    ]);
    return result.response.text();
  } catch (e) {
    return "❌ حصل خطأ مع Gemini.";
  }
}

function detectCodeLanguage(text) {
  if (/```python/i.test(text)) return "py";
  if (/```(js|javascript|node)/i.test(text)) return "js";
  if (/```ts/i.test(text)) return "ts";
  return null;
}

async function handleResponse(interaction, content) {
  if (content.length < 1900) {
    await interaction.reply(content);
  } else {
    const lang = detectCodeLanguage(content);
    let filename = "response.txt";
    if (lang) filename = `response.${lang}`;
    fs.writeFileSync(filename, content);
    const file = new AttachmentBuilder(filename);
    await interaction.reply({ content: "📄 الرد كبير اتحول لملف:", files: [file] });
    fs.unlinkSync(filename);
  }
}

// أوامر
const commands = [
  { name: "ask", description: "اسأل Gemini", options: [{ name: "question", description: "اكتب سؤالك", type: 3, required: true }] },
  { name: "room", description: "اختار روم يتكلم مع Gemini", options: [{ name: "channel", description: "اختار الروم", type: 7, required: true }] },
  { name: "the-rooms", description: "شوف الرومات المختارة" },
  { name: "delete-room", description: "امسح روم من استخدام Gemini", options: [{ name: "channel", description: "اختار الروم", type: 7, required: true }] }
];

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(token);
  for (const guild of client.guilds.cache.values()) {
    await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: commands });
  }

  // رسالة تدريب مرة واحدة
  await askGemini("انت بوت ديسكورد مخصص لمساعدة الاعضاء في البرمجة و التصاميم و الاسئلة العامة");
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ask") {
    const q = interaction.options.getString("question");
    const reply = await askGemini(q);
    await handleResponse(interaction, reply);
  }

  if (interaction.commandName === "room") {
    const channel = interaction.options.getChannel("channel");
    aiRooms.add(channel.id);
    await interaction.reply(`✅ تم تفعيل Gemini في روم: ${channel.name}`);
  }

  if (interaction.commandName === "the-rooms") {
    if (aiRooms.size === 0) return interaction.reply("مافيش رومات مفعلة");
    const list = [...aiRooms].map(id => `<#${id}>`).join("\n");
    await interaction.reply(`📌 الرومات المفعلة:\n${list}`);
  }

  if (interaction.commandName === "delete-room") {
    const channel = interaction.options.getChannel("channel");
    aiRooms.delete(channel.id);
    await interaction.reply(`🗑️ تم تعطيل Gemini في روم: ${channel.name}`);
  }
});

client.on("messageCreate", async message => {
  if (message.author.bot) return;
  if (aiRooms.has(message.channel.id)) {
    const reply = await askGemini(message.content);
    if (reply) {
      if (reply.length < 1900) {
        message.reply(reply);
      } else {
        const lang = detectCodeLanguage(reply);
        let filename = "response.txt";
        if (lang) filename = `response.${lang}`;
        fs.writeFileSync(filename, reply);
        const file = new AttachmentBuilder(filename);
        await message.reply({ content: "📄 الرد كبير اتحول لملف:", files: [file] });
        fs.unlinkSync(filename);
      }
    }
  }
});

client.login(token);
