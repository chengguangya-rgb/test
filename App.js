import React, { useState, useEffect } from 'react';
import { StyleSheet, View, FlatList, TouchableOpacity, Alert, Modal, TextInput, Text, SafeAreaView, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as ZipArchive from 'react-native-zip-archive';

const INVOICES_KEY = '@invoices';

const categoryIcons = {
  '餐饮': '🍔', '交通': '🚗', '办公': '🏢', '差旅': '✈️', '其他': '📄'
};

const getCategoryColor = (category) => {
  const colors = {
    '餐饮': '#FFF3E0', '交通': '#E3F2FD', '办公': '#E8F5E9', '差旅': '#F3E5F5', '其他': '#F5F5F5'
  };
  return colors[category] || '#F5F5F5';
};

const classifyInvoice = (seller = '', content = '') => {
  const text = (seller + ' ' + content).toLowerCase();
  const keywords = {
    '餐饮': ['餐饮', '餐厅', '饭店', '火锅', '烧烤', '咖啡', '奶茶', '外卖', '美食'],
    '交通': ['滴滴', '出租', '打车', '地铁', '公交', '加油', '停车', '高速'],
    '办公': ['办公', '文具', '打印', '耗材', '京东', '淘宝', '电脑', '手机'],
    '差旅': ['酒店', '住宿', '机票', '火车票', '高铁', '飞机', '旅行']
  };
  for (const [category, words] of Object.entries(keywords)) {
    for (const word of words) {
      if (text.includes(word.toLowerCase())) return category;
    }
  }
  return '其他';
};

export default function App() {
  const [invoices, setInvoices] = useState([]);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [modalVisible, setModalVisible] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [pdfUri, setPdfUri] = useState('');
  const [pdfName, setPdfName] = useState('');
  const [seller, setSeller] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('其他');

  useEffect(() => { loadInvoices(); }, []);

  const loadInvoices = async () => {
    try {
      const jsonValue = await AsyncStorage.getItem(INVOICES_KEY);
      if (jsonValue) setInvoices(JSON.parse(jsonValue));
    } catch (e) { console.error(e); }
  };

  const saveInvoice = async (invoice) => {
    try {
      const newInvoice = {
        ...invoice,
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        reimbursed: false,
      };
      if (!newInvoice.category || newInvoice.category === '其他') {
        newInvoice.category = classifyInvoice(newInvoice.seller, '');
      }
      const updated = [newInvoice, ...invoices];
      await AsyncStorage.setItem(INVOICES_KEY, JSON.stringify(updated));
      setInvoices(updated);
      return newInvoice;
    } catch (e) { throw e; }
  };

  const handleAddInvoice = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (result.canceled === false) {
        const file = result.assets[0];
        setPdfUri(file.uri);
        setPdfName(file.name);
        const recognized = classifyInvoice(file.name, '');
        setSeller(recognized.seller || '未知销售方');
        const amountMatch = file.name.match(/(\d+)/);
        setAmount(amountMatch ? amountMatch[1] : '');
        setCategory(recognized);
        setModalVisible(true);
      }
    } catch (err) { Alert.alert('错误', '选择文件失败'); }
  };

  const handleSave = async () => {
    if (!pdfName) { Alert.alert('提示', '请先选择PDF文件'); return; }
    try {
      const fileName = `invoice_${Date.now()}.pdf`;
      const newUri = FileSystem.documentDirectory + fileName;
      await FileSystem.copyAsync({ from: pdfUri, to: newUri });
      await saveInvoice({
        fileName: pdfName,
        pdfUri: newUri,
        seller: seller || '未知销售方',
        amount: amount || '0',
        category: category || '其他',
      });
      setModalVisible(false);
      setPdfUri(''); setPdfName(''); setSeller(''); setAmount(''); setCategory('其他');
      Alert.alert('成功', '发票已保存');
    } catch (e) { Alert.alert('错误', '保存失败'); }
  };

  const toggleReimbursed = async (id) => {
    const updated = invoices.map(inv => inv.id === id ? { ...inv, reimbursed: !inv.reimbursed } : inv);
    await AsyncStorage.setItem(INVOICES_KEY, JSON.stringify(updated));
    setInvoices(updated);
  };

  const handleDelete = async (id) => {
    Alert.alert('删除确认', '确定删除这张发票？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        const updated = invoices.filter(inv => inv.id !== id);
        await AsyncStorage.setItem(INVOICES_KEY, JSON.stringify(updated));
        setInvoices(updated);
      }}
    ]);
  };

  const handleBatchDownload = async () => {
    if (selectedItems.length === 0) { Alert.alert('提示', '请先选择发票'); return; }
    try {
      const selected = invoices.filter(inv => selectedItems.includes(inv.id));
      const filePaths = selected.map(inv => inv.pdfUri);
      const zipPath = FileSystem.cacheDirectory + `报销包_${Date.now()}.zip`;
      await ZipArchive.zip(filePaths, zipPath);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(zipPath);
      setBatchMode(false); setSelectedItems([]);
    } catch (e) { Alert.alert('错误', '打包失败'); }
  };

  const filteredInvoices = invoices.filter(inv => {
    const typeMatch = filterType === 'all' || inv.category === filterType;
    const statusMatch = filterStatus === 'all' || (filterStatus === 'pending' && !inv.reimbursed) || (filterStatus === 'reimbursed' && inv.reimbursed);
    return typeMatch && statusMatch;
  });

  const pendingTotal = invoices.filter(inv => !inv.reimbursed).reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0);
  const categories = ['all', '餐饮', '交通', '办公', '差旅', '其他'];

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>💰 发票助手</Text>
        <Text style={styles.headerSubtitle}>共 {invoices.length} 张 · 未报销 ¥{pendingTotal.toFixed(2)}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeFilterContainer}>
        {categories.map(cat => (
          <TouchableOpacity key={cat} style={[styles.typeFilterBtn, filterType === cat && styles.typeFilterBtnActive]} onPress={() => setFilterType(cat)}>
            <Text style={[styles.typeFilterText, filterType === cat && styles.typeFilterTextActive]}>{cat === 'all' ? '全部' : cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <View style={styles.statusFilterContainer}>
        {['all', 'pending', 'reimbursed'].map(status => (
          <TouchableOpacity key={status} style={[styles.statusFilterBtn, filterStatus === status && styles.statusFilterBtnActive]} onPress={() => setFilterStatus(status)}>
            <Text style={[styles.statusFilterText, filterStatus === status && styles.statusFilterTextActive]}>
              {status === 'all' ? '全部' : status === 'pending' ? '未报销' : '已报销'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={filteredInvoices}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.itemContainer} onPress={() => batchMode ? 
            setSelectedItems(prev => prev.includes(item.id) ? prev.filter(i => i !== item.id) : [...prev, item.id]) : 
            toggleReimbursed(item.id)}>
            <View style={styles.itemContent}>
              {batchMode && <View style={[styles.checkbox, selectedItems.includes(item.id) && styles.checkboxSelected]} />}
              <View style={styles.iconContainer}><Text style={styles.icon}>{categoryIcons[item.category] || '📄'}</Text></View>
              <View style={styles.info}>
                <Text style={styles.seller} numberOfLines={1}>{item.seller}</Text>
                <View style={styles.metaRow}>
                  <Text style={styles.amount}>¥{item.amount}</Text>
                  <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
                </View>
              </View>
              <View style={styles.rightSection}>
                <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(item.category) }]}>
                  <Text style={styles.categoryText}>{item.category}</Text>
                </View>
                {!batchMode && (
                  <View style={styles.statusContainer}>
                    <View style={[styles.statusBadge, item.reimbursed ? styles.statusReimbursed : styles.statusPending]}>
                      <Text style={[styles.statusText, item.reimbursed ? styles.statusTextReimbursed : styles.statusTextPending]}>{item.reimbursed ? '已报销' : '未报销'}</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleDelete(item.id)}><Text style={styles.deleteText}>🗑</Text></TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>📄 暂无发票</Text><Text style={styles.emptySubtext}>点击右下角添加</Text></View>}
      />
      {batchMode ? (
        <View style={styles.batchBar}>
          <Text style={styles.batchText}>已选 {selectedItems.length} 张</Text>
          <TouchableOpacity style={styles.batchDownloadBtn} onPress={handleBatchDownload}><Text style={styles.batchDownloadText}>📦 打包下载</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => { setBatchMode(false); setSelectedItems([]); }}><Text style={styles.cancelText}>取消</Text></TouchableOpacity>
        </View>
      ) : (
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.batchBtn} onPress={() => setBatchMode(true)}><Text style={styles.batchBtnText}>📦 批量选择</Text></TouchableOpacity>
          <TouchableOpacity style={styles.addButton} onPress={handleAddInvoice}><Text style={styles.addButtonText}>+</Text></TouchableOpacity>
        </View>
      )}
      <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>📤 添加发票</Text>
            <Text style={styles.fileName}>📄 {pdfName}</Text>
            <ScrollView style={styles.formScroll}>
              <Text style={styles.label}>销售方</Text>
              <TextInput style={styles.input} value={seller} onChangeText={setSeller} placeholder="自动识别..." />
              <Text style={styles.label}>金额</Text>
              <TextInput style={styles.input} value={amount} onChangeText={setAmount} placeholder="¥0.00" keyboardType="numeric" />
              <Text style={styles.label}>分类</Text>
              <View style={styles.categoryContainer}>
                {['餐饮', '交通', '办公', '差旅', '其他'].map(cat => (
                  <TouchableOpacity key={cat} style={[styles.categoryBtn, category === cat && styles.categoryBtnActive]} onPress={() => setCategory(cat)}>
                    <Text style={[styles.categoryText, category === cat && styles.categoryTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}><Text style={styles.cancelBtnText}>取消</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}><Text style={styles.saveBtnText}>保存</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#fff', paddingTop: 50, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#333' },
  headerSubtitle: { fontSize: 14, color: '#999', marginTop: 4 },
  typeFilterContainer: { backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  typeFilterBtn: { paddingHorizontal: 16, paddingVertical: 8, marginRight: 8, borderRadius: 16, backgroundColor: '#f0f0f0' },
  typeFilterBtnActive: { backgroundColor: '#007AFF' },
  typeFilterText: { fontSize: 14, color: '#666' },
  typeFilterTextActive: { color: '#fff', fontWeight: '600' },
  statusFilterContainer: { flexDirection: 'row', padding: 12, backgroundColor: '#fff', gap: 8 },
  statusFilterBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8, backgroundColor: '#f0f0f0' },
  statusFilterBtnActive: { backgroundColor: '#34C759' },
  statusFilterText: { fontSize: 14, color: '#666', fontWeight: '500' },
  statusFilterTextActive: { color: '#fff' },
  list: { padding: 16 },
  itemContainer: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 3 },
  itemContent: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#ddd', marginRight: 12 },
  checkboxSelected: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  iconContainer: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  icon: { fontSize: 24 },
  info: { flex: 1 },
  seller: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  amount: { fontSize: 16, fontWeight: '700', color: '#007AFF' },
  date: { fontSize: 13, color: '#999' },
  rightSection: { alignItems: 'flex-end', gap: 6 },
  categoryBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  categoryText: { fontSize: 12, fontWeight: '500', color: '#666' },
  statusContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusPending: { backgroundColor: '#FFF3E0' },
  statusReimbursed: { backgroundColor: '#E8F5E9' },
  statusText: { fontSize: 11, fontWeight: '500' },
  statusTextPending: { color: '#FF9500' },
  statusTextReimbursed: { color: '#34C759' },
  deleteText: { fontSize: 16 },
  empty: { alignItems: 'center', marginTop: 100 },
  emptyText: { fontSize: 18, color: '#999' },
  emptySubtext: { fontSize: 14, color: '#bbb', marginTop: 8 },
  bottomBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee' },
  batchBtn: { paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#f0f0f0', borderRadius: 8 },
  batchBtnText: { fontSize: 14, color: '#333', fontWeight: '500' },
  addButton: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center' },
  addButtonText: { fontSize: 32, color: '#fff', fontWeight: '300' },
  batchBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee' },
  batchText: { fontSize: 16, fontWeight: '600', color: '#333' },
  batchDownloadBtn: { backgroundColor: '#007AFF', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  batchDownloadText: { color: '#fff', fontWeight: '600' },
  cancelText: { color: '#999', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 24, maxHeight: '80%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 16, color: '#333' },
  fileName: { fontSize: 14, color: '#666', marginBottom: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 8 },
  formScroll: { maxHeight: 400 },
  label: { fontSize: 14, color: '#666', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16 },
  categoryContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  categoryBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, backgroundColor: '#f0f0f0' },
  categoryBtnActive: { backgroundColor: '#007AFF' },
  categoryText: { color: '#666' },
  categoryTextActive: { color: '#fff', fontWeight: '600' },
  modalButtons: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#f0f0f0', alignItems: 'center' },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#007AFF', alignItems: 'center' },
  cancelBtnText: { color: '#666', fontWeight: '600' },
  saveBtnText: { color: '#fff', fontWeight: '600' },
});
